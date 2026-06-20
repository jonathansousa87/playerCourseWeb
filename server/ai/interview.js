// Modo "Entrevista de Emprego" por modulo. Fase 1: gera 5 perguntas tecnicas
// abertas a partir das transcricoes do modulo. Fase 2: avalia as respostas do
// aluno (nota + feedback por pergunta + geral). As perguntas sao geradas de
// uma vez; o feedback vem no final (decisao de produto).

import { promises as fs } from 'fs';
import { join } from 'path';
import { chatCompletion, DEFAULT_MODEL } from './deepseek.js';
import { parseTranscript, parseTranscriptRaw } from './generator.js';
import {
  INTERVIEW_QUESTIONS_SYSTEM,
  buildInterviewQuestionsPrompt,
  INTERVIEW_EVAL_SYSTEM,
  buildInterviewEvalPrompt,
} from './prompts.js';

const TRANSCRIPT_RE = /_dub(?:\.[a-z]{2,3}(?:-[a-zA-Z]{2,4})?)?\.(txt|vtt)$/i;
const MATERIAL_TXT_RE = /_(?:flashcards_anki|resumo|exemplos|quiz|diario_tecnico)_dub_\d+/i;

const parseJsonLoose = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.indexOf('{');
    const b = cleaned.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { return null; }
    }
    return null;
  }
};

const clampScore = (n) => {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(10, x));
};

// Junta as transcricoes do modulo (recursivo, ordem alfanumerica).
const collectModuleText = async (moduleDir) => {
  const found = [];
  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (TRANSCRIPT_RE.test(e.name) && !MATERIAL_TXT_RE.test(e.name)) {
        found.push({ name: e.name, path: full });
      }
    }
  };
  await walk(moduleDir);
  found.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  );
  const parts = [];
  for (const f of found) {
    try { parts.push(await parseTranscript(f.path)); } catch { /* ignora ilegivel */ }
  }
  return parts.filter(Boolean).join('\n\n');
};

// Drive: modulePath = id da pasta do modulo. Le as transcricoes via Drive API.
const collectModuleTextDrive = async (moduleFolderId) => {
  const drive = await import('../drive/index.js');
  const files = drive.flattenFiles(await drive.listFilesRecursive(moduleFolderId))
    .filter((f) => TRANSCRIPT_RE.test(f.name) && !MATERIAL_TXT_RE.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const parts = [];
  for (const f of files) {
    try {
      parts.push(parseTranscriptRaw(await drive.getFileContent(f.id), /\.vtt$/i.test(f.name)));
    } catch { /* ignora ilegivel */ }
  }
  return parts.filter(Boolean).join('\n\n');
};

export const generateInterviewQuestions = async ({
  coursesPath, courseTitle, modulePath, moduleTitle, model = DEFAULT_MODEL,
}) => {
  const isDrive = (process.env.COURSE_SOURCE || 'filesystem').trim() === 'drive';
  const content = isDrive
    ? await collectModuleTextDrive(modulePath)
    : await collectModuleText(join(coursesPath, courseTitle, modulePath));
  if (content.length < 100) {
    const e = new Error('modulo sem transcricoes suficientes pra entrevista'); e.code = 'EMPTY_MODULE'; throw e;
  }

  const { content: raw, usage } = await chatCompletion({
    system: INTERVIEW_QUESTIONS_SYSTEM,
    user: buildInterviewQuestionsPrompt({ moduleTitle: moduleTitle || modulePath, content }),
    model,
    temperature: 0.5,
    maxTokens: 2000,
    responseFormat: { type: 'json_object' },
  });
  const parsed = parseJsonLoose(raw);
  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .map((q) => ({ question: String(q.question || '').trim(), topic: String(q.topic || '').trim() }))
    .filter((q) => q.question)
    .slice(0, 5);
  if (questions.length < 3) {
    const e = new Error('IA nao retornou perguntas validas'); e.code = 'BAD_QUESTIONS'; throw e;
  }
  return { questions, usage };
};

export const evaluateInterview = async ({ moduleTitle, questions, answers, model = DEFAULT_MODEL }) => {
  const qa = questions.map((q, i) => ({
    question: q.question,
    topic: q.topic,
    answer: String(answers?.[i]?.answer ?? answers?.[i] ?? '').trim(),
  }));

  const { content: raw, usage } = await chatCompletion({
    system: INTERVIEW_EVAL_SYSTEM,
    user: buildInterviewEvalPrompt({ moduleTitle: moduleTitle || 'modulo', qa }),
    model,
    // Orcamento folgado: o modelo "raciocina" antes do JSON; se faltar token o
    // JSON trunca e a avaliacao se perde.
    temperature: 0.3,
    maxTokens: 6000,
    responseFormat: { type: 'json_object' },
  });
  const parsed = parseJsonLoose(raw);

  // O DeepSeek as vezes varia a forma/nomes das chaves. Procura o array de
  // avaliacoes de forma tolerante, com sinonimos de score/comment.
  const findPerArray = (obj) => {
    if (!obj || typeof obj !== 'object') return [];
    const direct = obj.per_question || obj.perQuestion || obj.perguntas || obj.avaliacoes;
    if (Array.isArray(direct)) return direct;
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && ('score' in x || 'nota' in x || 'comment' in x))) {
        return v;
      }
    }
    return [];
  };
  const per = findPerArray(parsed);

  // Sem nenhuma avaliacao reconhecivel: falha alto (nao inventa zeros).
  if (per.length === 0) {
    console.error('[interview] avaliacao em formato inesperado:', String(raw).slice(0, 500));
    const e = new Error('IA nao retornou a avaliacao no formato esperado'); e.code = 'BAD_EVAL'; throw e;
  }

  const perQuestion = qa.map((_, i) => ({
    score: clampScore(per[i]?.score ?? per[i]?.nota),
    comment: String(per[i]?.comment ?? per[i]?.feedback ?? per[i]?.comentario ?? '').trim() || 'Sem feedback.',
  }));
  const overallScore = (parsed?.overall_score ?? parsed?.nota_geral) != null
    ? clampScore(parsed.overall_score ?? parsed.nota_geral)
    : clampScore(perQuestion.reduce((s, p) => s + p.score, 0) / perQuestion.length);

  return {
    feedback: {
      per_question: perQuestion,
      overall_comment: String(parsed?.overall_comment ?? parsed?.comentario_geral ?? '').trim() || 'Bom trabalho. Continue estudando os pontos destacados.',
    },
    score: overallScore,
    total: 10,
    usage,
  };
};
