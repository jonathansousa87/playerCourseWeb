import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import { chatCompletion, DEFAULT_MODEL } from './deepseek.js';
import {
  buildResumoPrompt,
  buildFlashcardsPrompt,
  buildQuizPrompt,
  buildDiarioPrompt,
  buildExemplosPrompt,
  SYSTEM_PROMPTS,
} from './prompts.js';
import { importDeck, parseAnkiFlashcards } from '../flashcards.js';

// Extensao esperada por tipo
const KIND_EXT = {
  resumo: 'md',
  quiz: 'html',
  flashcards: 'txt',
  diario: 'md',
  exemplos: 'html',
};

// Base do sufixo (antes do numero). Reflete o que o usuario ja tem no disco.
const KIND_BASE_SUFFIX = {
  resumo: '_resumo_dub',
  quiz: '_quiz_dub',
  flashcards: '_flashcards_anki_dub',
  diario: '_diario_tecnico_dub',
  exemplos: '_exemplos_dub',
};

// Remove tags/fences se o modelo retornar envolto em ```lang...```
const stripCodeFence = (s) => {
  const trimmed = s.trim();
  const fenceMatch = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
};

const parseVtt = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  // VTT: remove cabecalho WEBVTT, linhas com timestamps e linhas em branco redundantes
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t === 'WEBVTT') continue;
    if (/^\d+$/.test(t)) continue; // cue number
    if (/-->/.test(t)) continue; // timestamp
    if (/^NOTE\b/i.test(t)) continue;
    out.push(t);
  }
  // Remove duplicatas adjacentes (comum em legendas dub)
  const dedup = [];
  for (const line of out) {
    if (dedup[dedup.length - 1] !== line) dedup.push(line);
  }
  return dedup.join(' ').replace(/\s+/g, ' ').trim();
};

// Caminha na arvore do curso ate achar um arquivo que comeca com o prefixo e casa o predicate.
const findFile = async (root, prefix, predicate) => {
  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (e.name.startsWith(prefix) && predicate(e.name)) {
        return full;
      }
    }
    return null;
  };
  return walk(root);
};

const findTranscript = (courseRoot, lessonPrefix) =>
  findFile(
    courseRoot,
    lessonPrefix,
    (name) => /_dub(?:\.[a-z-]+)?\.vtt$/i.test(name),
  );

// Encontra um arquivo de referencia (pra herdar o numero NN de _dub_NN)
// Ex: "001 1 Download e Instalacoes_resumo_dub_02.md" -> retorna "02"
const findReferenceNumber = async (courseRoot, lessonPrefix) => {
  const numbers = [];
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
      } else if (e.name.startsWith(lessonPrefix)) {
        const m = e.name.match(/_dub_(\d+)(?:_ia)?\./i);
        if (m) numbers.push(parseInt(m[1], 10));
      }
    }
  };
  await walk(courseRoot);
  if (numbers.length === 0) return '01';
  return String(Math.max(...numbers)).padStart(2, '0');
};

// Encontra o diretorio da aula (onde esta o arquivo de video dub.*)
const findLessonDir = async (courseRoot, lessonPrefix) => {
  const file = await findFile(
    courseRoot,
    lessonPrefix,
    (name) => /_dub\.(mp4|webm|ts|m3u8|mkv)$/i.test(name),
  );
  if (file) return dirname(file);
  // Fallback: qualquer arquivo com o prefixo
  const any = await findFile(courseRoot, lessonPrefix, () => true);
  return any ? dirname(any) : null;
};

const promptBuilders = {
  resumo: buildResumoPrompt,
  flashcards: buildFlashcardsPrompt,
  quiz: buildQuizPrompt,
  diario: buildDiarioPrompt,
  exemplos: buildExemplosPrompt,
};

export const generateForLesson = async ({
  coursesPath,
  courseTitle,
  lessonPrefix,
  kinds,
  model = DEFAULT_MODEL,
}) => {
  const courseRoot = join(coursesPath, courseTitle);
  const transcriptPath = await findTranscript(courseRoot, lessonPrefix);
  if (!transcriptPath) {
    const err = new Error(
      'transcricao .vtt nao encontrada pra essa aula. Gere o .vtt (Whisper) antes.',
    );
    err.code = 'NO_TRANSCRIPT';
    throw err;
  }
  const transcript = await parseVtt(transcriptPath);
  if (transcript.length < 50) {
    const err = new Error('transcricao vazia ou muito curta');
    err.code = 'EMPTY_TRANSCRIPT';
    throw err;
  }

  const lessonDir = await findLessonDir(courseRoot, lessonPrefix);
  if (!lessonDir) {
    const err = new Error('diretorio da aula nao encontrado');
    err.code = 'NO_LESSON_DIR';
    throw err;
  }

  const refNumber = await findReferenceNumber(courseRoot, lessonPrefix);
  const lessonTitle = basename(transcriptPath).replace(/_dub.*$/i, '').trim();

  const now = new Date();
  const weekNumber = Math.ceil(
    ((now - new Date(now.getFullYear(), 0, 1)) / 86400000 + 1) / 7,
  );
  const weekLabel = `Semana ${String(weekNumber).padStart(2, '0')}/${now.getFullYear()}`;

  const results = [];
  for (const kind of kinds) {
    if (!promptBuilders[kind]) {
      results.push({ kind, ok: false, error: `kind desconhecido: ${kind}` });
      continue;
    }
    try {
      const user = promptBuilders[kind]({ lessonTitle, transcript, weekLabel });
      const { content, usage, model: usedModel } = await chatCompletion({
        system: SYSTEM_PROMPTS[kind],
        user,
        model,
        temperature: kind === 'quiz' ? 0.5 : 0.3,
        maxTokens: kind === 'quiz' || kind === 'exemplos' ? 8000 : 6000,
      });
      const cleaned = stripCodeFence(content);

      // Validar conteudo antes de salvar
      if (kind === 'flashcards') {
        const testCards = parseAnkiFlashcards(cleaned);
        if (testCards.length < 3) {
          results.push({ kind, ok: false, error: `Flashcards: apenas ${testCards.length} cards parseados (minimo 3). O modelo nao seguiu o formato.` });
          continue;
        }
      }
      if (kind === 'quiz') {
        if (!cleaned.includes('question-card') || !cleaned.includes('answer-btn')) {
          results.push({ kind, ok: false, error: 'Quiz: HTML gerado nao contem a estrutura esperada (.question-card / .answer-btn).' });
          continue;
        }
      }

      const filename = `${lessonPrefix}${KIND_BASE_SUFFIX[kind]}_${refNumber}_ia.${KIND_EXT[kind]}`;
      const outPath = join(lessonDir, filename);
      await fs.writeFile(outPath, cleaned, 'utf8');

      const entry = {
        kind,
        ok: true,
        file: filename,
        path: outPath,
        usage,
        model: usedModel,
      };

      // Apos gerar flashcards, importa no deck FSRS (dedup por front+back).
      if (kind === 'flashcards') {
        try {
          const deck = await importDeck({ coursesPath, courseTitle, lessonPrefix });
          entry.deck = deck;
        } catch (err) {
          entry.deckError = err.message;
        }
      }

      results.push(entry);
    } catch (err) {
      results.push({ kind, ok: false, error: err.message });
    }
  }

  return {
    lessonPrefix,
    transcriptPath,
    lessonDir,
    referenceNumber: refNumber,
    results,
  };
};
