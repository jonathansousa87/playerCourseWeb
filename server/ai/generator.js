import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import { chatCompletion, DEFAULT_MODEL } from './deepseek.js';
import {
  buildFlashcardsPrompt,
  buildQuizPrompt,
  buildDiarioPrompt,
  buildExemplosPrompt,
  buildPiadaPrompt,
  buildUpdateReadingPrompt,
  UPDATE_READING_SYSTEM,
  SYSTEM_PROMPTS,
} from './prompts.js';
import { importDeckFromContent, parseAnkiFlashcards } from '../flashcards.js';
import { query } from '../../db/index.js';


// Remove tags/fences se o modelo retornar envolto em ```lang...```
const stripCodeFence = (s) => {
  const trimmed = s.trim();
  const fenceMatch = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
};

// Normaliza o texto bruto de uma transcricao (puro ou VTT).
export const parseTranscriptRaw = (raw, isVtt = false) => {
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (isVtt) {
      if (t === 'WEBVTT') continue;
      if (/^\d+$/.test(t)) continue;
      if (/-->/.test(t)) continue;
      if (/^NOTE\b/i.test(t)) continue;
    }
    out.push(t);
  }
  const dedup = [];
  for (const line of out) {
    if (dedup[dedup.length - 1] !== line) dedup.push(line);
  }
  return dedup.join(' ').replace(/\s+/g, ' ').trim();
};

// Le e normaliza a partir de um caminho local.
export const parseTranscript = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseTranscriptRaw(raw, /\.vtt$/i.test(filePath));
};

// Carrega a transcricao de uma aula independente da fonte (filesystem ou Drive).
// Retorna { text, ref, lessonTitle } — ref e o caminho local ou fileId no Drive.
export const loadTranscriptForLesson = async ({ courseTitle, lessonPrefix, coursesPath }) => {
  if (process.env.COURSE_SOURCE === 'drive') {
    const { findTranscriptInDrive, getFileContent } = await import('../drive/index.js');
    const result = await findTranscriptInDrive(courseTitle, lessonPrefix);
    if (!result) {
      const err = new Error('transcricao nao encontrada no Drive para essa aula');
      err.code = 'NO_TRANSCRIPT';
      throw err;
    }
    const raw = await getFileContent(result.fileId);
    const isVtt = /\.vtt$/i.test(result.name);
    return {
      text: parseTranscriptRaw(raw, isVtt),
      // markdown = conteudo CRU (quebras preservadas). Consumido SO no update da
      // Leitura (ver isReadingMarkdown); pro resto o `text` achatado serve.
      markdown: isVtt ? null : raw,
      ref: result.fileId,
      lessonTitle: result.name.replace(/_dub.*$/i, '').trim(),
    };
  }
  // Modo filesystem (padrao)
  const courseRoot = join(coursesPath, courseTitle);
  const transcriptPath = await findTranscript(courseRoot, lessonPrefix);
  if (!transcriptPath) {
    const err = new Error('transcricao (.txt ou .vtt) nao encontrada. Gere com Whisper antes.');
    err.code = 'NO_TRANSCRIPT';
    throw err;
  }
  const raw = await fs.readFile(transcriptPath, 'utf8');
  const isVtt = /\.vtt$/i.test(transcriptPath);
  return {
    text: parseTranscriptRaw(raw, isVtt),
    markdown: isVtt ? null : raw, // cru (quebras) — usado so no update da Leitura
    ref: transcriptPath,
    lessonTitle: basename(transcriptPath).replace(/_dub.*$/i, '').trim(),
  };
};

// A Leitura e markdown ESTRUTURADO (curso "- Leitura" + cabecalhos ##); ja a
// transcricao de video e texto corrido (sem ##). So preservamos as quebras
// quando as DUAS condicoes batem — senao, fallback pro `text` achatado de sempre.
const isReadingMarkdown = (courseTitle, md) =>
  /\s-\sLeitura$/.test(courseTitle) && !!md && /\n#{1,3}\s/.test(md);

// Alias mantido pra compatibilidade. Usar `parseTranscript` em codigo novo.
export const parseVtt = parseTranscript;

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

// Aceita .txt (formato novo, mais enxuto) ou .vtt (legado), com locale
// opcional. Se houver os dois na mesma pasta, prioriza o .txt.
export const findTranscript = async (courseRoot, lessonPrefix) => {
  const txt = await findFile(
    courseRoot,
    lessonPrefix,
    (name) => /_dub(?:\.[a-z]{2,3}(?:-[a-zA-Z]{2,4})?)?\.txt$/i.test(name)
      // Exclui materiais que casariam o regex amplo demais (mas terminam em
      // _flashcards_anki_dub_NN.txt etc, que nao sao transcricao).
      && !/_(?:flashcards_anki|resumo|exemplos|quiz|diario_tecnico)_dub_\d+/i.test(name),
  );
  if (txt) return txt;
  return findFile(
    courseRoot,
    lessonPrefix,
    (name) => /_dub(?:\.[a-z-]+)?\.vtt$/i.test(name),
  );
};

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

// "resumo" = a LEITURA. No "Gerar IA" ele NAO recondensa (isso e do "Gerar curso
// de leitura"): pega a leitura existente e so ATUALIZA os diagramas (padrao
// ```mermaid com classDef) + aplica a instrucao. Preserva o texto.
const promptBuilders = {
  resumo: ({ lessonTitle, transcript, instruction }) => buildUpdateReadingPrompt({ lessonTitle, transcript, instruction }),
  flashcards: buildFlashcardsPrompt,
  quiz: buildQuizPrompt,
  diario: buildDiarioPrompt,
  exemplos: buildExemplosPrompt,
  piada: buildPiadaPrompt,
};
// system por kind; resumo usa o system de atualizacao de leitura.
const systemForKind = { ...SYSTEM_PROMPTS, resumo: UPDATE_READING_SYSTEM };

// Roda fn sobre items com no maximo `limit` em paralelo, preservando a ordem.
const mapPool = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

export const generateForLesson = async ({
  userId,
  coursesPath,
  courseTitle,
  lessonPrefix,
  kinds,
  model = DEFAULT_MODEL,
  instruction = '',
}) => {
  if (!userId) throw new Error('generateForLesson: userId obrigatorio');
  const { text: transcript, markdown: readingMarkdown, ref: transcriptPath, lessonTitle: lessonTitleFromTranscript } =
    await loadTranscriptForLesson({ courseTitle, lessonPrefix, coursesPath });

  if (transcript.length < 50) {
    const err = new Error('transcricao vazia ou muito curta');
    err.code = 'EMPTY_TRANSCRIPT';
    throw err;
  }

  // Em modo Drive nao ha diretorio local — lessonDir e usado so pra log/retorno
  const courseRoot = join(coursesPath || '', courseTitle);
  const lessonDir = process.env.COURSE_SOURCE === 'drive'
    ? null
    : await findLessonDir(courseRoot, lessonPrefix);
  if (!lessonDir && process.env.COURSE_SOURCE !== 'drive') {
    const err = new Error('diretorio da aula nao encontrado');
    err.code = 'NO_LESSON_DIR';
    throw err;
  }

  const refNumber = process.env.COURSE_SOURCE === 'drive'
    ? '01'
    : await findReferenceNumber(courseRoot, lessonPrefix);
  const lessonTitle = lessonTitleFromTranscript;

  const now = new Date();
  const weekNumber = Math.ceil(
    ((now - new Date(now.getFullYear(), 0, 1)) / 86400000 + 1) / 7,
  );
  const weekLabel = `Semana ${String(weekNumber).padStart(2, '0')}/${now.getFullYear()}`;

  // Kinds em paralelo (a concorrencia real na API + retry sao garantidos pelo
  // semaforo do deepseek.js). Cobre tambem chamadas multi-kind (ex.: materiais
  // gerados apos o curso de leitura).
  const results = await mapPool(kinds, 4, async (kind) => {
    if (!promptBuilders[kind]) {
      return { kind, ok: false, error: `kind desconhecido: ${kind}` };
    }
    try {
      // Leitura (kind 'resumo' = a LEITURA): se for curso "- Leitura" com
      // markdown estruturado, manda o CRU (quebras preservadas) pra IA so
      // atualizar/preservar — sem isso o parseTranscript achata e a leitura
      // pode voltar como 1 linha so. Os demais kinds usam o transcript de sempre.
      const source = kind === 'resumo' && isReadingMarkdown(courseTitle, readingMarkdown)
        ? readingMarkdown
        : transcript;
      const user = promptBuilders[kind]({ lessonTitle, transcript: source, weekLabel, instruction });
      const { content, usage, model: usedModel } = await chatCompletion({
        system: systemForKind[kind],
        user,
        model,
        temperature: kind === 'quiz' ? 0.5 : 0.3,
        // resumo=LEITURA e exemplos podem ter varios diagramas Mermaid (texto
        // longo) -> tokens generosos pra o codigo NAO truncar (senao quebra a sintaxe).
        maxTokens: kind === 'exemplos' || kind === 'resumo' ? 13000 : kind === 'quiz' ? 8000 : 6000,
      });
      const cleaned = stripCodeFence(content);

      // Validar conteudo antes de salvar
      if (kind === 'flashcards') {
        const testCards = parseAnkiFlashcards(cleaned);
        if (testCards.length < 3) {
          return { kind, ok: false, error: `Flashcards: apenas ${testCards.length} cards parseados (minimo 3). O modelo nao seguiu o formato.` };
        }
      }
      if (kind === 'quiz') {
        const questionCount = (cleaned.match(/^## \d+\./gm) || []).length;
        if (questionCount < 3 || !cleaned.includes('- [x]')) {
          return { kind, ok: false, error: `Quiz: ${questionCount} questoes detectadas / sem alternativa [x]. Modelo nao seguiu o formato Markdown.` };
        }
      }

      const entry = { kind, ok: true, usage, model: usedModel, storage: 'db' };

      if (kind === 'flashcards') {
        // Importa direto da string — sem gravar arquivo em disco.
        try {
          entry.deck = await importDeckFromContent(cleaned, { userId, courseTitle, lessonPrefix });
        } catch (err) {
          entry.deckError = err.message;
        }
      } else {
        // resumo | quiz | exemplos | diario — salva no banco.
        await query(
          `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (course_title, lesson_prefix, kind)
           DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
          [courseTitle, lessonPrefix, kind, cleaned],
        );
      }

      return entry;
    } catch (err) {
      return { kind, ok: false, error: err.message };
    }
  });

  return {
    lessonPrefix,
    transcriptPath,
    lessonDir,
    referenceNumber: refNumber,
    results,
  };
};
