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
        // Timeout (AbortError) / erro de rede: re-tenta com backoff.
        const transient = err.name === 'AbortError' || err.name === 'TypeError' || err.code === 'ECONNRESET';
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
