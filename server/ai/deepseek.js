// Cliente minimalista pra DeepSeek API (OpenAI-compatible).
// Doc: https://api-docs.deepseek.com/api/create-chat-completion
//
// Modelos:
//   deepseek-v4-flash : context 1M, $0.14/M input miss, $0.0028/M input cache hit,
//                       $0.28/M output. Suporta thinking ON/OFF.
//   deepseek-v4-pro   : 75% mais caro mas raciocina mais (R1-style).
// Os antigos `deepseek-chat` / `deepseek-reasoner` viraram alias e serao
// descontinuados. Estamos no v4-flash (non-thinking) por default — barato +
// rapido + cache 50x mais barato (perfeito pro chat por aula que reusa o
// system prompt da transcricao).
//
// A DeepSeek NAO publica rate limit fixo nem manda headers de limite; sob carga
// ela responde mais devagar e, as vezes, 429/503. Por isso o cliente:
//   1) limita a concorrencia global (DEEPSEEK_CONCURRENCY, default 4) — paraleliza
//      sem martelar; o teto vale pra TODAS as chamadas do processo;
//   2) re-tenta com backoff exponencial em 429/503/5xx/timeout
//      (DEEPSEEK_MAX_RETRIES, default 5), respeitando Retry-After quando vier.
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export const DEFAULT_MODEL = 'deepseek-v4-flash';

// Preco por 1M de tokens (USD). v4-pro e ~75% mais caro que o flash.
// input miss = prompt fora do cache; input hit = prompt servido do cache (50x
// mais barato); output = tokens gerados.
const PRICING = {
  'deepseek-v4-flash': { miss: 0.14, hit: 0.0028, out: 0.28 },
  'deepseek-v4-pro': { miss: 0.14 * 1.75, hit: 0.0028 * 1.75, out: 0.28 * 1.75 },
};

// Custo (USD) de UMA chamada a partir do objeto `usage` da DeepSeek. Se os
// campos de cache nao vierem, trata todo o prompt como miss (pior caso).
export const costFromUsage = (usage, model = DEFAULT_MODEL) => {
  if (!usage) return 0;
  const p = PRICING[model] || PRICING[DEFAULT_MODEL];
  const hit = usage.prompt_cache_hit_tokens || 0;
  const miss = usage.prompt_cache_miss_tokens != null
    ? usage.prompt_cache_miss_tokens
    : Math.max(0, (usage.prompt_tokens || 0) - hit);
  const out = usage.completion_tokens || 0;
  return (miss * p.miss + hit * p.hit + out * p.out) / 1e6;
};

export class DeepSeekError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'DeepSeekError';
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Semaforo de concorrencia global (1 por processo Node) ---
const MAX_CONCURRENCY = Math.max(1, parseInt(process.env.DEEPSEEK_CONCURRENCY || '4', 10));
let active = 0;
const waiters = [];
const acquire = () =>
  new Promise((resolve) => {
    if (active < MAX_CONCURRENCY) { active += 1; resolve(); }
    else waiters.push(resolve);
  });
const release = () => {
  const next = waiters.shift();
  if (next) next();              // passa o slot direto pro proximo (active inalterado)
  else active = Math.max(0, active - 1);
};

const MAX_RETRIES = Math.max(0, parseInt(process.env.DEEPSEEK_MAX_RETRIES || '5', 10));
const isRetriableStatus = (s) => s === 429 || s === 408 || (s >= 500 && s < 600);

// Espera do backoff: respeita Retry-After (s) se vier; senao exponencial + jitter.
const backoffMs = (attempt, retryAfter) => {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs > 0) return Math.min(60_000, secs * 1000);
  }
  return Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
};

// Uma tentativa de POST (com timeout proprio). Retorna a Response.
const postOnce = async (apiKey, body) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    return await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const chatCompletion = async ({
  system,
  user,
  model = DEFAULT_MODEL,
  temperature = 0.4,
  maxTokens = 4096,
  responseFormat,
  // Controla o "thinking" do modelo. Passe { type: 'disabled' } para emitir a
  // resposta direto, sem gastar o orcamento de output em reasoning (mais barato
  // e evita truncar JSON em prompts grandes — ver planGrouping).
  thinking,
}) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError('DEEPSEEK_API_KEY nao configurada no .env');
  }

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  const body = { model, messages, temperature, max_tokens: maxTokens, stream: false };
  if (responseFormat) body.response_format = responseFormat;
  if (thinking) body.thinking = thinking;

  await acquire();
  try {
    let lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const res = await postOnce(apiKey, body);

        if (res.ok) {
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content;
          if (!content) throw new DeepSeekError('Resposta da DeepSeek sem content', { body: data });
          return { content, usage: data.usage || null, model: data.model || model };
        }

        const text = await res.text().catch(() => '');
        // Erros transitorios: re-tenta com backoff. Demais: falha na hora.
        if (isRetriableStatus(res.status) && attempt < MAX_RETRIES) {
          lastErr = new DeepSeekError(`DeepSeek HTTP ${res.status}`, { status: res.status, body: text });
          await sleep(backoffMs(attempt, res.headers.get('retry-after')));
          continue;
        }
        throw new DeepSeekError(`DeepSeek respondeu HTTP ${res.status}`, { status: res.status, body: text });
      } catch (err) {
        // Timeout (AbortError) / erro de rede / resposta 200 SEM content (instabilidade
        // ocasional da API, ja vista ao vivo: HTTP ok mas choices[0].message.content vazio)
        // sao transitorias: re-tenta com backoff. Sem isso, essa falha derrubava a aula na
        // hora, sem chance de recuperar numa proxima tentativa.
        const transient = err.name === 'AbortError' || err.name === 'TypeError' || err.code === 'ECONNRESET'
          || (err instanceof DeepSeekError && err.message === 'Resposta da DeepSeek sem content');
        if (transient && attempt < MAX_RETRIES) {
          lastErr = err;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new DeepSeekError('DeepSeek falhou apos varias tentativas');
  } finally {
    release();
  }
};
