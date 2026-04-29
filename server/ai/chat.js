// Chat com IA com contexto da aula. Usa a transcricao .vtt como base do
// system prompt — o modelo responde duvidas grounded no conteudo, nao
// inventa coisas que nao apareceram na aula.

import { join } from 'path';
import { DEFAULT_MODEL } from './deepseek.js';
import { parseTranscript, findTranscript } from './generator.js';

const SYSTEM_BASE =
  'Voce eh um tutor pessoal que ajuda o aluno a entender uma aula em video. ' +
  'Responde duvidas em portugues do Brasil de forma clara e concisa. ' +
  'Use APENAS o que aparece na transcricao da aula como base. Se a duvida ' +
  'nao puder ser respondida com o conteudo da aula, diga isso explicitamente ' +
  'em vez de inventar. Pode usar listas, blocos de codigo (```) e markdown ' +
  'pra estruturar a resposta quando ajudar.';

const trunc = (text, max = 16000) =>
  text.length > max ? text.slice(0, max) + '\n\n[TRANSCRICAO TRUNCADA]' : text;

export const chatWithLesson = async ({
  coursesPath,
  courseTitle,
  lessonPrefix,
  messages,
  model = DEFAULT_MODEL,
}) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('messages vazio');
    err.code = 'EMPTY_MESSAGES';
    throw err;
  }

  const courseRoot = join(coursesPath, courseTitle);
  const transcriptPath = await findTranscript(courseRoot, lessonPrefix);
  if (!transcriptPath) {
    const err = new Error('transcricao (.txt ou .vtt) nao encontrada pra essa aula');
    err.code = 'NO_TRANSCRIPT';
    throw err;
  }
  const transcript = await parseTranscript(transcriptPath);
  if (transcript.length < 50) {
    const err = new Error('transcricao vazia ou muito curta');
    err.code = 'EMPTY_TRANSCRIPT';
    throw err;
  }

  // Monta system prompt: base + contexto da aula. As mensagens do usuario
  // (e respostas anteriores do assistant) vem depois pro DeepSeek manter
  // historico de turn.
  const system = `${SYSTEM_BASE}

Transcricao da aula (use como unica fonte de verdade):
---
${trunc(transcript)}
---`;

  // Converte historico do front (role/content) para o formato esperado.
  // Aceita 'user' e 'assistant'. Ignora qualquer outra role.
  const safeHistory = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content || '') }));

  const last = safeHistory[safeHistory.length - 1];
  if (!last || last.role !== 'user') {
    const err = new Error('ultima mensagem precisa ser do user');
    err.code = 'BAD_LAST_MESSAGE';
    throw err;
  }

  const allMessages = [
    { role: 'system', content: system },
    ...safeHistory,
  ];

  // Reusa chatCompletion mas precisa enviar o array completo, nao so
  // system+user. Vamos chamar a API direta aqui pra preservar historico.
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error('DEEPSEEK_API_KEY nao configurada no .env');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let res;
  try {
    res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        temperature: 0.4,
        max_tokens: 2000,
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`DeepSeek HTTP ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error('Resposta da DeepSeek sem content');
    throw err;
  }

  return {
    reply: content,
    usage: data.usage || null,
    model: data.model || model,
  };
};
