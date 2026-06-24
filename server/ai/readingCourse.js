// Gera um "curso de leitura" a partir das transcricoes de um curso em video.
// Para cada modulo: (1) a IA decide o agrupamento das aulas, (2) a IA condensa
// cada grupo num texto de leitura limpo, gravado como .txt no novo curso.
// O .txt resultante alimenta depois o pipeline normal (resumo/exemplos/quiz...).
//
// Roda SOMENTE em modo filesystem (precisa escrever arquivos em disco).

import { promises as fs } from 'fs';
import { join } from 'path';
import { chatCompletion, DEFAULT_MODEL } from './deepseek.js';
import { parseTranscript, parseTranscriptRaw } from './generator.js';
import { transcribeToTxt } from './whisperx.js';
import { query } from '../../db/index.js';
import {
  READING_PLAN_SYSTEM,
  buildReadingPlanPrompt,
  READING_CONDENSE_SYSTEM,
  buildReadingCondensePrompt,
} from './prompts.js';

// Mesmo padrao usado pelo findTranscript: _dub[.locale].(txt|vtt)
const TRANSCRIPT_RE = /_dub(?:\.[a-z]{2,3}(?:-[a-zA-Z]{2,4})?)?\.(txt|vtt)$/i;
// Materiais gerados que terminam em .txt (flashcards) NAO sao transcricao.
const MATERIAL_TXT_RE = /_(?:flashcards_anki|resumo|exemplos|quiz|diario_tecnico)_dub_\d+/i;
// Arquivo de video da aula. Qualquer extensao de video conta — inclusive o
// .mp4 "cru" (sem _dub) de cursos ainda nao processados pelo DubAI. O _dub
// (quando existe) e removido pra casar com a transcricao correspondente.
const VIDEO_RE = /\.(mp4|webm|ts|m3u8|mkv)$/i;
// Stem canonico de um arquivo: tira a extensao de video e o sufixo _dub, pra
// "X.mp4", "X_dub.mp4" e "X_dub.pt-BR.txt" caírem todos no mesmo "X".
const videoStem = (path) => path.replace(VIDEO_RE, '').replace(/_dub$/i, '');

const lessonTitleFromFile = (name) => name.replace(TRANSCRIPT_RE, '').trim();

// Remove caracteres invalidos pra nome de arquivo/pasta.
const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

// Remove "12. " / "12) " do inicio do titulo do modulo.
const cleanModuleTitle = (title) => title.replace(/^\s*\d+\s*[.)-]\s*/, '').trim();

// Remove numero do inicio do titulo da aula (evita "01 1. Introducao").
const cleanLessonTitle = (title) => title.replace(/^\s*\d+\s*[.)-]\s*/, '').trim() || title;

const pad2 = (n) => String(n).padStart(2, '0');

// Parse de JSON tolerante: tira fences ```json e, se falhar, tenta extrair o
// objeto do primeiro "{" ao ultimo "}". Retorna null se nao der.
const parseJsonLoose = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.indexOf('{');
    const b = cleaned.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(cleaned.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

// Roda fn sobre items com no maximo `limit` em paralelo, preservando a ordem.
const mapPool = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
};

// Coleta as transcricoes de um modulo (recursivo), na ordem alfanumerica.
const collectModuleTranscripts = async (moduleDir) => {
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
        // bytes ~ densidade da aula (proxy de duracao) p/ o plano equilibrar grupos.
        let bytes = 0;
        try { bytes = (await fs.stat(full)).size; } catch { /* sem stat */ }
        found.push({ name: e.name, path: full, title: lessonTitleFromFile(e.name), bytes });
      }
    }
  };
  await walk(moduleDir);
  found.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }),
  );
  return found.map((t, id) => ({ id, ...t }));
};

// Antes de montar o curso de leitura: as aulas que tem video mas ainda NAO tem
// transcricao (.txt/.vtt) sao transcritas pelo WhisperX, gerando <base>_dub.txt
// na propria pasta (no padrao que o collectModuleTranscripts ja entende).
// Retorna um resumo { transcribed, failed, skipped } pra mostrar no front.
const transcribeMissingTranscripts = async (moduleDir, language = 'pt') => {
  // Curso em ingles: WhisperX usa o modelo English-only (distil-large-v3.5,
  // mais rapido/preciso pra EN); a traducao pra PT-BR acontece na condensacao.
  const whisper = language === 'en'
    ? { model: (process.env.WHISPERX_MODEL_EN || '').trim() || 'distil-large-v3.5', language: 'en' }
    : { model: undefined, language: 'pt' };
  const videos = [];
  const haveStem = new Set();
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
      } else if (VIDEO_RE.test(e.name)) {
        videos.push({ name: e.name, path: full, stem: videoStem(full) });
      } else if (TRANSCRIPT_RE.test(e.name) && !MATERIAL_TXT_RE.test(e.name)) {
        haveStem.add(full.replace(TRANSCRIPT_RE, ''));
      }
    }
  };
  await walk(moduleDir);

  const pending = videos.filter((v) => !haveStem.has(v.stem));
  const summary = { transcribed: 0, failed: [], skipped: false };
  if (pending.length === 0) return summary;

  if (!(process.env.WHISPERX_BIN || '').trim()) {
    // Sem WhisperX configurado: nao trava o fluxo — segue so com quem ja tem txt.
    summary.skipped = true;
    return summary;
  }

  // Serial de proposito: WhisperX satura GPU/CPU; rodar em paralelo so atrapalha.
  for (const v of pending) {
    try {
      const produced = await transcribeToTxt({ audioFile: v.path, model: whisper.model, language: whisper.language });
      // Normaliza pro padrao da plataforma: <stem>_dub.txt. Pra video cru
      // (X.mp4 -> X.txt) renomeia; pra X_dub.mp4 ja sai certo (X_dub.txt).
      const target = `${v.stem}_dub.txt`;
      if (produced !== target) await fs.rename(produced, target);
      summary.transcribed += 1;
    } catch (err) {
      summary.failed.push({ file: v.name, error: err.message });
    }
  }
  return summary;
};

// Fase 1: a IA decide o agrupamento. Fallback robusto = cada aula isolada.
const planGrouping = async ({ moduleTitle, transcripts, model }) => {
  const fallback = () =>
    transcripts.map((t) => ({ title: t.title, sources: [t.id] }));

  if (transcripts.length <= 1) return fallback();

  try {
    const { content } = await chatCompletion({
      system: READING_PLAN_SYSTEM,
      user: buildReadingPlanPrompt({
        moduleTitle,
        lessons: transcripts.map((t) => ({ id: t.id, title: t.title, bytes: t.bytes || 0 })),
      }),
      model,
      temperature: 0.2,
      // Orcamento generoso: o modelo "raciocina" antes do JSON e modulos
      // grandes geram planos longos. Se faltar token, o JSON trunca e cai no
      // fallback isolado (= "aula por aula"). Escala com o nº de aulas.
      maxTokens: Math.min(8000, 2500 + transcripts.length * 150),
      responseFormat: { type: 'json_object' },
    });
    const parsed = parseJsonLoose(content);
    if (!parsed) throw new Error('plano: JSON invalido/truncado');
    const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : [];
    // Valida: ids reais, cobertura total, sem duplicar.
    const validIds = new Set(transcripts.map((t) => t.id));
    const seen = new Set();
    const plan = [];
    for (const l of lessons) {
      const sources = (Array.isArray(l.sources) ? l.sources : [])
        .map(Number)
        .filter((id) => validIds.has(id) && !seen.has(id));
      if (sources.length === 0) continue;
      sources.forEach((id) => seen.add(id));
      const title = (l.title || '').trim() || transcripts[sources[0]].title;
      plan.push({ title, sources });
    }
    // Garante cobertura: aulas que a IA esqueceu entram isoladas.
    for (const t of transcripts) {
      if (!seen.has(t.id)) plan.push({ title: t.title, sources: [t.id] });
    }
    return plan.length ? plan : fallback();
  } catch {
    return fallback();
  }
};

// Fase 2 (parte IA): condensa um texto ja montado numa aula de leitura.
const condenseText = async ({ lessonTitle, merged, model, instruction, language = 'pt' }) => {
  if (!merged || merged.length < 40) return null;
  const { content, usage, model: usedModel } = await chatCompletion({
    system: READING_CONDENSE_SYSTEM,
    user: buildReadingCondensePrompt({ lessonTitle, transcript: merged, instruction, sourceLanguage: language }),
    model,
    temperature: 0.3,
    maxTokens: 8000,
  });
  return { text: content.trim(), usage, model: usedModel };
};

// fs: le as transcricoes do disco e condensa.
const condenseLesson = async ({ lessonTitle, sources, model, instruction, language = 'pt' }) => {
  const parts = [];
  for (const src of sources) {
    try {
      parts.push(await parseTranscript(src.path));
    } catch {
      /* ignora transcricao ilegivel */
    }
  }
  return condenseText({ lessonTitle, merged: parts.filter(Boolean).join('\n\n'), model, instruction, language });
};

// Gera o curso de leitura para UM modulo. Despacha pro modo do .env.
export const generateReadingModule = async (opts) => {
  const isDrive = (process.env.COURSE_SOURCE || 'filesystem').trim() === 'drive';
  return isDrive ? generateReadingModuleDrive(opts) : generateReadingModuleFs(opts);
};

// Versao filesystem (padrao). modulePath e relativo a raiz do curso.
const generateReadingModuleFs = async ({
  coursesPath,
  courseTitle,
  modulePath,
  moduleTitle,
  index = 1,
  model = DEFAULT_MODEL,
  instruction = '',
  autoTranscribe = true,
  language = 'pt',
  onProgress = () => {},
}) => {
  const moduleDir = join(coursesPath, courseTitle, modulePath);

  // Fase 0: aulas sem .txt sao transcritas pelo WhisperX antes de tudo.
  let transcription = null;
  if (autoTranscribe) {
    onProgress({ type: 'transcricao', status: 'start' });
    transcription = await transcribeMissingTranscripts(moduleDir, language);
  }
  onProgress({ type: 'transcricao', status: 'done', ...(transcription || {}) });

  const transcripts = await collectModuleTranscripts(moduleDir);
  if (transcripts.length === 0) {
    onProgress({ type: 'plano', total: 0 });
    return { module: moduleTitle, skipped: 'sem transcricoes', transcription, created: [] };
  }

  const plan = await planGrouping({ moduleTitle, transcripts, model });
  onProgress({ type: 'plano', total: plan.length });

  const outRoot = join(coursesPath, `${courseTitle} - Leitura`);
  const readingCourseTitle = `${courseTitle} - Leitura`;
  const moduleFolderName = safeName(cleanModuleTitle(moduleTitle));
  const outDir = join(outRoot, `${pad2(index)} ${moduleFolderName}`);

  // Re-rodar deve ser 100% idempotente: remove QUALQUER pasta anterior deste
  // modulo (mesmo com numero diferente — o indice ou o agrupamento podem ter
  // mudado) e apaga os resumos orfaos correspondentes no banco. Assim nao
  // duplica pasta nem deixa lixo no Supabase.
  try {
    for (const d of await fs.readdir(outRoot)) {
      if (!/^\d+\s/.test(d) || d.replace(/^\d+\s+/, '') !== moduleFolderName) continue;
      const oldDir = join(outRoot, d);
      try {
        for (const f of await fs.readdir(oldDir)) {
          const m = f.match(TRANSCRIPT_RE);
          if (!m) continue;
          const prefix = f.slice(0, m.index);
          await query(
            "DELETE FROM lesson_materials WHERE course_title = $1 AND lesson_prefix = $2 AND kind = 'resumo'",
            [readingCourseTitle, prefix],
          );
        }
      } catch { /* ignora erro de leitura/banco */ }
      await fs.rm(oldDir, { recursive: true, force: true });
    }
  } catch { /* outRoot novo, nada a limpar */ }
  await fs.mkdir(outDir, { recursive: true });

  // Condensa as aulas planejadas em paralelo (ate 4 por vez). A ordem do
  // arquivo (NN) segue a posicao no plano, nao a de conclusao.
  const created = await mapPool(plan, 4, async (lesson, idx) => {
    onProgress({ type: 'aula', status: 'start', i: idx, title: cleanLessonTitle(lesson.title) });
    const title = cleanLessonTitle(lesson.title);
    const sources = lesson.sources.map((id) => transcripts[id]).filter(Boolean);
    let res;
    try {
      const out = await condenseLesson({ lessonTitle: title, sources, model, instruction, language });
      if (!out) {
        res = { title, ok: false, error: 'transcricao vazia' };
      } else {
        const fileTitle = `${pad2(idx + 1)} ${safeName(title)}`;
        const fileName = `${fileTitle}_dub.txt`;
        await fs.writeFile(join(outDir, fileName), out.text, 'utf8');
        try {
          await query(
            `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
             VALUES ($1, $2, 'resumo', $3)
             ON CONFLICT (course_title, lesson_prefix, kind)
             DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
            [`${courseTitle} - Leitura`, fileTitle, out.text],
          );
        } catch { /* DB falhou: o .txt ainda permite gerar o resumo via "Gerar IA". */ }
        res = { title, file: fileName, prefix: fileTitle, sources: sources.map((s) => s.title), ok: true, usage: out.usage };
      }
    } catch (err) {
      res = { title, ok: false, error: err.message };
    }
    onProgress({ type: 'aula', status: 'done', i: idx, title, ok: res.ok });
    return res;
  });

  return { module: moduleTitle, outDir, transcription, created };
};

// Versao Drive. modulePath = id da pasta do modulo no Drive (vem da arvore).
// Le transcricoes que JA existem no Drive, condensa/traduz e sobe os .txt na
// pasta "<curso> - Leitura". WhisperX nao roda aqui (exigiria baixar os videos):
// aulas sem .txt sao puladas.
const generateReadingModuleDrive = async ({
  courseTitle, modulePath, moduleTitle, index = 1,
  model = DEFAULT_MODEL, instruction = '', language = 'pt',
  onProgress = () => {},
}) => {
  const drive = await import('../drive/index.js');
  const { getDriveFolderId } = await import('../config.js');
  const rootId = getDriveFolderId();
  if (!rootId) throw new Error('DRIVE_COURSES_FOLDER_ID nao configurado');

  const moduleFolderId = modulePath;
  const transcription = { transcribed: 0, failed: [], skipped: true };
  onProgress({ type: 'transcricao', status: 'done', ...transcription });

  const files = drive.flattenFiles(await drive.listFilesRecursive(moduleFolderId));
  const transcripts = files
    .filter((f) => TRANSCRIPT_RE.test(f.name) && !MATERIAL_TXT_RE.test(f.name))
    .map((f) => ({ name: f.name, fileId: f.id, title: lessonTitleFromFile(f.name), bytes: Number(f.size) || 0 }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }))
    .map((t, id) => ({ id, ...t }));
  if (transcripts.length === 0) {
    onProgress({ type: 'plano', total: 0 });
    return { module: moduleTitle, skipped: 'sem transcricoes', transcription, created: [] };
  }

  const plan = await planGrouping({ moduleTitle, transcripts, model });
  onProgress({ type: 'plano', total: plan.length });

  const readingCourseTitle = `${courseTitle} - Leitura`;
  const leituraRootId = await drive.ensureSubfolder(rootId, readingCourseTitle);
  const cleanPart = safeName(cleanModuleTitle(moduleTitle));
  const moduleFolderName = `${pad2(index)} ${cleanPart}`;

  // Idempotente: remove pasta(s) antiga(s) deste modulo + resumos orfaos no DB.
  try {
    for (const d of await drive.listFolders(leituraRootId)) {
      if (!/^\d+\s/.test(d.name) || d.name.replace(/^\d+\s+/, '') !== cleanPart) continue;
      try {
        const old = drive.flattenFiles(await drive.listFilesRecursive(d.id));
        for (const f of old) {
          const m = f.name.match(TRANSCRIPT_RE);
          if (!m) continue;
          await query(
            "DELETE FROM lesson_materials WHERE course_title = $1 AND lesson_prefix = $2 AND kind = 'resumo'",
            [readingCourseTitle, f.name.slice(0, m.index)],
          );
        }
      } catch { /* ignora */ }
      await drive.deleteFile(d.id);
    }
  } catch { /* leitura nova */ }

  const outFolderId = await drive.ensureSubfolder(leituraRootId, moduleFolderName);

  const created = await mapPool(plan, 4, async (lesson, idx) => {
    const title = cleanLessonTitle(lesson.title);
    onProgress({ type: 'aula', status: 'start', i: idx, title });
    const sources = lesson.sources.map((id) => transcripts[id]).filter(Boolean);
    let res;
    try {
      const parts = [];
      let readErrors = 0;
      for (const s of sources) {
        try {
          parts.push(parseTranscriptRaw(await drive.getFileContent(s.fileId), /\.vtt$/i.test(s.name)));
        } catch { readErrors += 1; }
      }
      // Se havia fontes e NENHUMA foi lida, foi erro de leitura (Drive), nao aula
      // vazia: falha visivel (com mensagem) em vez de sumir silenciosamente.
      if (parts.length === 0 && sources.length > 0) {
        throw new Error(`falha ao ler ${readErrors}/${sources.length} transcricao(oes) no Drive`);
      }
      const out = await condenseText({
        lessonTitle: title, merged: parts.filter(Boolean).join('\n\n'), model, instruction, language,
      });
      if (!out) {
        res = { title, ok: false, error: 'transcricao vazia' };
      } else {
        const fileTitle = `${pad2(idx + 1)} ${safeName(title)}`;
        const fileName = `${fileTitle}_dub.txt`;
        await drive.uploadText(outFolderId, fileName, out.text);
        try {
          await query(
            `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
             VALUES ($1, $2, 'resumo', $3)
             ON CONFLICT (course_title, lesson_prefix, kind)
             DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
            [readingCourseTitle, fileTitle, out.text],
          );
        } catch { /* DB falhou: o .txt ja esta no Drive */ }
        res = { title, file: fileName, prefix: fileTitle, sources: sources.map((s) => s.title), ok: true, usage: out.usage };
      }
    } catch (err) {
      res = { title, ok: false, error: err.message };
    }
    onProgress({ type: 'aula', status: 'done', i: idx, title, ok: res.ok });
    return res;
  });

  return { module: moduleTitle, outFolderId, transcription, created };
};
