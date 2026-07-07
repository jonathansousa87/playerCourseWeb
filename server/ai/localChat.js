// Chamada OpenAI-compatible ao llama-server LOCAL (Qwen, mesmo endpoint do
// pre-condensador — PRECONDENSE_URL). Generica: qualquer etapa que queira rodar
// no modelo local em vez do DeepSeek usa isso. Hoje: extracao de fatos da leitura
// (ETAPA 1, ver readingCourse.js) atras da flag EXTRACT_LOCAL_ENABLED.

const truthy = (v) => /^(1|true|yes|on)$/i.test((v || '').trim());

const URL = (process.env.PRECONDENSE_URL || 'http://127.0.0.1:8080/v1/chat/completions').trim();
const MODEL = (process.env.PRECONDENSE_MODEL || 'local').trim();

export const extractLocalEnabled = () => truthy(process.env.EXTRACT_LOCAL_ENABLED);

// Contexto do llama-server local (bate com `-c` no start.sh, default 16384) e
// orcamento reservado pra saida — o resto vira o teto de ENTRADA (prompt) aceito.
// Margem de seguranca cobre o chat template/tokens especiais (nao contam no texto
// puro que medimos). Configuravel via .env pra acompanhar se o modelo local mudar.
const LOCAL_CTX = Math.max(2048, parseInt(process.env.EXTRACT_LOCAL_CTX || '16384', 10));
const LOCAL_OUTPUT_BUDGET = Math.max(1024, parseInt(process.env.EXTRACT_LOCAL_MAX_OUTPUT || '8000', 10));
const SAFETY_MARGIN = 300;

// Estimativa de tokens sem tokenizer real: ~3.5 chars/token e razoavel pra PT-BR +
// codigo misturados (medido nos spikes de extracao). Usada SO pra decidir se cabe
// no contexto local — nunca pra cobranca (chamada local e gratis).
export const estimateTokens = (s) => Math.ceil((s || '').length / 3.5);

// Decide se um prompt (system+user) cabe no contexto do modelo local deixando
// espaco pro output. Conservador de proposito: e melhor cair pro DeepSeek a toa do
// que estourar o contexto e o llama-server truncar o prompt PELA FRENTE — cortando
// justamente o bloco de schema/instrucoes (foi o que quebrou o Gemma no spike:
// "truncating input prompt limit=2051 prompt=4200 keep=5 new=2051").
export const fitsLocalContext = (system, user) => {
  const estimated = estimateTokens(system) + estimateTokens(user);
  return estimated + LOCAL_OUTPUT_BUDGET + SAFETY_MARGIN <= LOCAL_CTX;
};

export const localOutputBudget = () => LOCAL_OUTPUT_BUDGET;

export const callLocalChat = async ({ system, user, maxTokens = 4096, temperature = 0.1, timeoutMs = 300000 }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
    }
    const data = await res.json();
    const content = (data?.choices?.[0]?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '') // reasoning off no start.sh, mas remove se vazar
      .trim();
    if (!content) throw new Error('resposta sem content');
    return { content, usage: data.usage || null };
  } finally {
    clearTimeout(timeout);
  }
};
