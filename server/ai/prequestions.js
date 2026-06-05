// Geracao de pre-questoes (Carpenter & Toftness 2017). Le a transcricao
// da aula, chama DeepSeek pedindo JSON puro com 3 perguntas de multipla
// escolha. Valida o shape antes de retornar — se o modelo violar, falha
// alto pra o usuario regenerar em vez de salvar lixo no DB.

import { chatCompletion, DEFAULT_MODEL } from './deepseek.js';
import { buildPrequestionsPrompt, SYSTEM_PROMPTS } from './prompts.js';
import { loadTranscriptForLesson } from './generator.js';

// Tira fence ```json...``` se o modelo ignorar a regra.
const stripFence = (s) => {
  const m = s.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  return (m ? m[1] : s).trim();
};

const validateShape = (parsed) => {
  if (!parsed || typeof parsed !== 'object') return 'JSON nao eh objeto';
  if (!Array.isArray(parsed.questions)) return 'questions ausente ou nao-array';
  if (parsed.questions.length < 2 || parsed.questions.length > 5) {
    return `questions tem ${parsed.questions.length} itens (esperado 2-5)`;
  }
  for (const [i, q] of parsed.questions.entries()) {
    if (typeof q.question !== 'string' || !q.question.trim()) {
      return `q${i}.question vazio ou invalido`;
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return `q${i}.options precisa ter 4 alternativas`;
    }
    if (q.options.some((o) => typeof o !== 'string' || !o.trim())) {
      return `q${i}.options tem alternativa vazia/invalida`;
    }
    if (!Number.isInteger(q.correct_idx) || q.correct_idx < 0 || q.correct_idx > 3) {
      return `q${i}.correct_idx invalido (precisa ser 0-3)`;
    }
    if (typeof q.explanation !== 'string') {
      return `q${i}.explanation precisa ser string`;
    }
  }
  return null;
};

export const generatePrequestionsForLesson = async ({
  coursesPath,
  courseTitle,
  lessonPrefix,
  model = DEFAULT_MODEL,
}) => {
  const { text: transcript, lessonTitle: lessonTitleFromTranscript } =
    await loadTranscriptForLesson({ courseTitle, lessonPrefix, coursesPath });
  if (transcript.length < 50) {
    const err = new Error('transcricao vazia ou muito curta');
    err.code = 'EMPTY_TRANSCRIPT';
    throw err;
  }

  const lessonTitle = lessonPrefix.replace(/[-_]+$/, '').replace(/-/g, ' ').trim();
  const user = buildPrequestionsPrompt({ lessonTitle, transcript });

  const { content, usage, model: usedModel } = await chatCompletion({
    system: SYSTEM_PROMPTS.prequestions,
    user,
    model,
    temperature: 0.5,
    maxTokens: 2000,
    responseFormat: { type: 'json_object' },
  });

  let parsed;
  try {
    parsed = JSON.parse(stripFence(content));
  } catch (parseErr) {
    const err = new Error(`Modelo retornou JSON invalido: ${parseErr.message}`);
    err.code = 'BAD_JSON';
    err.raw = content;
    throw err;
  }

  const shapeErr = validateShape(parsed);
  if (shapeErr) {
    const err = new Error(`JSON com shape invalido: ${shapeErr}`);
    err.code = 'BAD_SHAPE';
    err.raw = content;
    throw err;
  }

  return {
    questions: parsed.questions,
    usage,
    model: usedModel,
  };
};
