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

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  if (responseFormat) body.response_format = responseFormat;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    var res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new DeepSeekError(`DeepSeek respondeu HTTP ${res.status}`, {
      status: res.status,
      body: text,
    });
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new DeepSeekError('Resposta da DeepSeek sem content', { body: data });
  }
  return {
    content,
    usage: data.usage || null,
    model: data.model || model,
  };
};
