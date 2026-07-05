// Gera um "curso de leitura" a partir das transcricoes de um curso em video.
// Para cada modulo: (1) a IA decide o agrupamento das aulas, (2) a IA condensa
// cada grupo num texto de leitura limpo, gravado como .txt no novo curso.
// O .txt resultante alimenta depois o pipeline normal (resumo/exemplos/quiz...).
//
// Roda SOMENTE em modo filesystem (precisa escrever arquivos em disco).

import { promises as fs } from 'fs';
import { join } from 'path';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import {
  preCondenseCached, preCondenseEnabled, normalizeEnabled, applyNorm,
  qwenExtract, normMapFromFingerprints, contractEnabled, buildContract,
} from './precondense.js';
import { startQwen, stopQwen } from './qwenServer.js';
import { parseTranscript, parseTranscriptRaw } from './generator.js';
import { transcribeToTxt, detectAudioLanguage } from './whisperx.js';
import { processVideoOcr, ocrTextEnabled, ocrDiagramEnabled } from './ocr/ocrModule.mjs';
import { correctTranscriptWithOcr } from './ocr/ocrCorrect.mjs';
import { query } from '../../db/index.js';
import {
  READING_PLAN_SYSTEM,
  buildReadingPlanPrompt,
  READING_CONDENSE_SYSTEM,
  buildReadingCondensePrompt,
  clarityEnabled,
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

// Deteccao simples de idioma (PT vs EN) por stopwords — usada quando o usuario
// escolhe "auto" no Gerar leitura (lote misto: umas aulas em PT, outras em EN).
// Heuristica leve sobre os primeiros ~5k chars; empate -> PT.
const detectLang = (text) => {
  const s = (text || '').toLowerCase().slice(0, 5000);
  const count = (re) => (s.match(re) || []).length;
  const pt = count(/\b(que|n[aã]o|uma|com|para|voc[eê]|ent[aã]o|isso|porque|tamb[eé]m|est[aá]|s[aã]o|fazer|gente|agora|vamos|aqui|mas|como|ele|ela)\b/g);
  const en = count(/\b(the|and|that|this|with|for|you|are|because|also|will|we|of|to|in|but|how|is|it|on)\b/g);
  return en > pt ? 'en' : 'pt';
};

// Remove do banco TUDO atrelado a uma aula (prefix) orfa ao regenerar. Duas
// categorias, ambas invalidas apos a regeneracao:
//  1. Materiais gerados pela IA: lesson_materials (resumo/quiz/exemplos/diario/
//     piada/podcast), deck de flashcards (cascateia pros cards/reviews) e a
//     pre-quiz (lesson_prequestions).
//  2. Progresso do aluno: tentativas de quiz/pre-quiz, chat da aula, etapas
//     concluidas e resumo pessoal. Como o material foi regerado (logo, o antigo
//     nao servia) e a aula nova nunca foi assistida, esse progresso e "morto" —
//     marcacao invalida que so confundiria as estatisticas se sobrevivesse.
// Sem isso, regerar uma aula cujo titulo (= prefix) mudou deixaria tudo isso
// orfao no Supabase, apontando pra um prefixo que nao existe mais.
const purgeLessonDb = async (courseTitle, prefix) => {
  for (const sql of [
    'DELETE FROM lesson_materials WHERE course_title = $1 AND lesson_prefix = $2',
    'DELETE FROM flashcard_decks WHERE course_title = $1 AND lesson_prefix = $2',
    'DELETE FROM lesson_prequestions WHERE course_title = $1 AND lesson_prefix = $2',
    'DELETE FROM quiz_attempts WHERE course_title = $1 AND lesson_prefix = $2',
    'DELETE FROM prequestion_attempts WHERE course_title = $1 AND lesson_prefix = $2',
    'DELETE FROM lesson_chats WHERE course_title = $1 AND lesson_prefix = $2',
    'DELETE FROM step_completions WHERE course_title = $1 AND lesson_prefix = $2',
    'DELETE FROM personal_notes WHERE course_title = $1 AND lesson_prefix = $2',
  ]) {
    try {
      await query(sql, [courseTitle, prefix]);
    } catch { /* ignora erro de banco */ }
  }
};

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

// O DubAI gera um arquivo EXTRA por aula com complemento: "X.Y.1" (atualizacao
// "Atualizando para...", "Resolucao do desafio", etc.) ALEM do "X.Y" original —
// CONTEUDO DIFERENTE, nao duplicata. Detectamos esses pares por NUMERO (em codigo,
// deterministico) e fundimos numa unica aula LOGICA com varias `parts` (original
// primeiro), ANTES do planGrouping. Sem isso, o modulo vira N arquivos isolados,
// o DeepSeek nao consegue agrupar (titulos quase iguais) e nao ha condensacao.
// "X.Y.1" e complemento de "X.Y" SOMENTE quando "X.Y" tambem existe no modulo.
const lessonNum = (name) => { const m = name.match(/(?:^|[_ ])(\d+(?:\.\d+)+)/); return m ? m[1] : null; };
const baseNum = (n) => n.replace(/\.\d+$/, '');
const mergeComplements = (found) => {
  const nums = new Set(found.map((f) => lessonNum(f.name)).filter(Boolean));
  const byNum = new Map();
  const logical = [];
  for (const f of found) {
    const num = lessonNum(f.name);
    const part = { name: f.name, path: f.path, fileId: f.fileId, bytes: f.bytes || 0 };
    if (num) {
      const base = baseNum(num);
      if (base !== num && base.includes('.') && nums.has(base) && byNum.has(base)) {
        const L = byNum.get(base);
        L.parts.push(part);
        L.bytes += part.bytes;
        continue; // complemento -> anexado a aula base (ordem: original, depois complemento)
      }
    }
    const L = { title: f.title, bytes: part.bytes, parts: [part] };
    logical.push(L);
    if (num) byNum.set(num, L);
  }
  return logical;
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
  // Funde complementos (X.Y.1 -> X.Y) em aulas logicas antes do plano.
  return mergeComplements(found).map((t, id) => ({ id, ...t }));
};

// Antes de montar o curso de leitura: as aulas que tem video mas ainda NAO tem
// transcricao (.txt/.vtt) sao transcritas pelo WhisperX, gerando <base>_dub.txt
// na propria pasta (no padrao que o collectModuleTranscripts ja entende).
// Retorna um resumo { transcribed, failed, skipped } pra mostrar no front.
const transcribeMissingTranscripts = async (moduleDir, language = 'pt') => {
  const videos = [];
  const haveStem = new Set();
  const existingTxts = [];
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
        existingTxts.push(full);
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

  // "auto": resolve o idioma p/ 'pt'/'en' (cada um usa o SEU modelo validado).
  // Preferencia: texto de uma transcricao ja existente (free); senao, sonda os
  // PRIMEIROS 30s do audio com o WhisperX multilingue; sem nada, cai em PT.
  let lang = language;
  if (lang === 'auto') {
    let sample = '';
    for (const p of existingTxts) { try { sample = await parseTranscript(p); if (sample) break; } catch { /* ignora */ } }
    if (sample) lang = detectLang(sample);
    else if (pending.length) lang = await detectAudioLanguage({ audioFile: pending[0].path });
    else lang = 'pt';
  }
  // EN -> distil-large-v3.5 (English-only); PT -> large-v3-turbo (default).
  // A traducao EN->PT acontece depois, na condensacao.
  const whisper = lang === 'en'
    ? { model: (process.env.WHISPERX_MODEL_EN || '').trim() || 'distil-large-v3.5', language: 'en' }
    : { model: undefined, language: 'pt' };

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

// === OCR do módulo: extrai vocabulário canônico + diagramas dos vídeos. ===
// Roda DEPOIS da transcrição (tem os .txt) e ANTES da pré-condensação.
// O vocabulário corrige o garble do WhisperX na fonte (beneficia tudo).
// Cache por vídeo: roda 1× por vídeo e reusa.
// PaddleOCR no CPU (fora do revezamento de VRAM); VL na GPU (derruba Qwen texto).
// Degrada gracioso: OCR off ou falha -> vocabulário vazio, F1 heurística segue.
const collectModuleVideos = async (moduleDir) => {
  const videos = [];
  const walk = async (dir) => {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (VIDEO_RE.test(e.name)) videos.push(full);
    }
  };
  await walk(moduleDir);
  return videos;
};

// Processa OCR de todos os vídeos de um módulo e agrega o vocabulário + diagramas.
// Retorna { vocabulary: [...], diagrams: [...], ocrCorrections: [...] }.
const runOcrForModule = async (moduleDir, coursesPath, log = () => {}, onProgress = () => {}) => {
  if (!ocrTextEnabled() && !ocrDiagramEnabled()) {
    return { vocabulary: [], diagrams: [], ocrCorrections: [] };
  }
  const videos = await collectModuleVideos(moduleDir);
  if (!videos.length) return { vocabulary: [], diagrams: [], ocrCorrections: [] };

  log(`[ocr] processando ${videos.length} vídeos do módulo...`);
  const allVocab = new Map(); // dedup case-insensitive
  const allDiagrams = [];
  let processed = 0;

  for (const v of videos) {
    const videoName = v.split('/').pop();
    onProgress({ video: videoName, index: processed + 1, total: videos.length });
    log(`[ocr] vídeo ${processed + 1}/${videos.length}: ${videoName}`);
    try {
      const r = await processVideoOcr({ videoPath: v, coursesPath, log });
      processed++;
      // Funde vocabulário (dedup, prefere versão com mais maiúsculas)
      for (const tok of r.vocabulary || []) {
        if (!tok || tok.length < 2) continue;
        const lower = tok.toLowerCase();
        const existing = allVocab.get(lower);
        if (existing) {
          const capsExisting = (existing.match(/[A-Z]/g) || []).length;
          const capsNew = (tok.match(/[A-Z]/g) || []).length;
          if (capsNew > capsExisting) allVocab.set(lower, tok);
        } else {
          allVocab.set(lower, tok);
        }
      }
      for (const d of r.diagrams || []) allDiagrams.push(d);
    } catch (err) {
      log(`[ocr] erro em ${videoName}: ${err.message}`);
      processed++;
    }
  }

  const vocabulary = [...allVocab.values()];
  log(`[ocr] módulo: ${processed}/${videos.length} vídeos, ${vocabulary.length} tokens, ${allDiagrams.length} diagramas`);
  return { vocabulary, diagrams: allDiagrams, ocrCorrections: [] };
};

// Detecta o idioma do CURSO inteiro (para "auto", modo filesystem): usa o texto
// de uma transcricao ja existente (free); se nao houver nenhuma, sonda os 30s do
// primeiro video com o WhisperX multilingue. Resultado vale pro curso todo
// (cacheado pelo chamador); cada novo curso e validado de novo. Retorna 'pt'|'en'.
const detectCourseLanguageFs = async (coursesPath, courseTitle, log = () => {}) => {
  const root = join(coursesPath, courseTitle);
  let firstTxt = null;
  let firstVideo = null;
  const walk = async (dir) => {
    if (firstTxt) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (firstTxt) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (TRANSCRIPT_RE.test(e.name) && !MATERIAL_TXT_RE.test(e.name)) firstTxt = full;
      else if (!firstVideo && VIDEO_RE.test(e.name)) firstVideo = full;
    }
  };
  await walk(root);
  if (firstTxt) {
    try { const t = await parseTranscript(firstTxt); if (t) return detectLang(t); } catch { /* ignora */ }
  }
  if (firstVideo) {
    log(`[auto] "${courseTitle}": sondando idioma pelos 30s iniciais do audio...`);
    return detectAudioLanguage({ audioFile: firstVideo });
  }
  return 'pt';
};

// Fase 1: a IA decide o agrupamento. Fallback robusto = cada aula isolada.
// Retorna { plan, usage } — usage entra no custo do modulo.
// Diagnostico opt-in: grava prompt/resposta/parse/plano em arquivo p/ investigar
// agrupamento. Ative com PLAN_DEBUG=1 (desligado por padrao).
const planDebug = async (moduleTitle, payload) => {
  if (process.env.PLAN_DEBUG !== '1') return;
  try {
    const { appendFile } = await import('fs/promises');
    const stamp = new Date().toISOString();
    const safe = (moduleTitle || '').replace(/[^\w.-]+/g, '_').slice(0, 60);
    await appendFile(
      `plan-debug-${safe}.log`,
      `\n===== ${stamp} | ${moduleTitle} =====\n${payload}\n`,
      'utf8',
    );
  } catch { /* log e best-effort */ }
};

const planGrouping = async ({ moduleTitle, transcripts, model, fingerprints = [] }) => {
  const fallback = () =>
    transcripts.map((t) => ({ title: t.title, sources: [t.id] }));

  if (transcripts.length <= 1) return { plan: fallback(), usage: null };

  // F4: enriquece o titulo com o fingerprint (por posicao) -> agrupamento por
  // afinidade real, nao so pelo titulo. Sem fingerprints, usa o titulo cru.
  const userPrompt = buildReadingPlanPrompt({
    moduleTitle,
    lessons: transcripts.map((t, i) => {
      const fp = fingerprints[i];
      return { id: t.id, title: fp ? `${t.title} — [${fp.replace(/\n/g, '; ').slice(0, 240)}]` : t.title, bytes: t.bytes || 0 };
    }),
  });
  const validIds = new Set(transcripts.map((t) => t.id));

  // Monta o plano validado (ids reais, cobertura total, sem duplicar) a partir do
  // JSON do modelo. Retorna null se o JSON for invalido/truncado.
  const buildPlan = (content) => {
    const parsed = parseJsonLoose(content);
    const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : null;
    if (!lessons) return null;
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
    for (const t of transcripts) if (!seen.has(t.id)) plan.push({ title: t.title, sources: [t.id] });
    return plan.length ? plan : null;
  };

  // Two-step (o modelo e de "thinking"): os tokens de reasoning saem do MESMO
  // orcamento da saida. Em modulos grandes (~39 aulas) o reasoning sozinho podia
  // estourar o max_tokens (finish_reason='length') e o JSON nunca era emitido.
  //
  // ETAPA 1 (raciocinio): thinking LIGADO + orcamento generoso p/ o reasoning
  // terminar E ainda emitir o JSON. Plano mais rico/consolidado. No caso comum
  // resolve aqui mesmo, em 1 chamada.
  try {
    const max1 = Math.min(24000, 8000 + transcripts.length * 400);
    const { content, usage } = await chatCompletion({
      system: READING_PLAN_SYSTEM, user: userPrompt, model,
      temperature: 0.2, maxTokens: max1, responseFormat: { type: 'json_object' },
    });
    await planDebug(moduleTitle,
      `[ETAPA 1] ${transcripts.length} aulas | maxTokens=${max1}\n[USAGE] ${JSON.stringify(usage)}\n`
      + `--- PROMPT ---\n${userPrompt}\n--- RESPOSTA (len=${content?.length}) ---\n${content}\n`);
    const plan = buildPlan(content);
    if (plan) {
      await planDebug(moduleTitle, `[ETAPA 1 OK] plano=${plan.length}\n[GRUPOS] ${JSON.stringify(plan.map((p) => p.sources))}\n`);
      return { plan, usage };
    }
    throw new Error('etapa 1: JSON invalido/truncado');
  } catch (err1) {
    await planDebug(moduleTitle, `[ETAPA 1 FALHOU -> ETAPA 2] ${err1?.message || err1}`);
    // ETAPA 2 (formatacao determinista): thinking DESLIGADO. Barato e sem
    // reasoning, o JSON sai direto — garante um plano valido mesmo quando a
    // etapa 1 truncou. Plano menos consolidado, mas integro e cobrindo tudo.
    try {
      const max2 = Math.min(8000, 2500 + transcripts.length * 150);
      const { content, usage } = await chatCompletion({
        system: READING_PLAN_SYSTEM, user: userPrompt, model,
        temperature: 0.2, maxTokens: max2, responseFormat: { type: 'json_object' },
        thinking: { type: 'disabled' },
      });
      const plan = buildPlan(content);
      if (plan) {
        await planDebug(moduleTitle, `[ETAPA 2 OK] plano=${plan.length}\n[GRUPOS] ${JSON.stringify(plan.map((p) => p.sources))}\n`);
        return { plan, usage };
      }
    } catch (err2) {
      await planDebug(moduleTitle, `[ETAPA 2 FALHOU -> fallback isolado] ${err2?.message || err2}`);
    }
    return { plan: fallback(), usage: null };
  }
};

// Fase 2 (parte IA): condensa um texto ja montado numa aula de leitura.
// `normMap` (F1, opcional): correcoes de mis-transcricao ja vetadas p/ o modulo,
// aplicadas DETERMINISTICO ao texto antes do DeepSeek (no-op se vazio/ausente).
const condenseText = async ({ lessonTitle, merged, model, instruction, language = 'pt', normMap, clarity = false, contract = '' }) => {
  if (!merged || merged.length < 40) return null;
  const text = normMap && normMap.length ? applyNorm(merged, normMap) : merged;
  // "auto" -> detecta o idioma desta aula a partir do texto (lote misto PT/EN).
  const sourceLanguage = language === 'auto' ? detectLang(text) : language;
  // F4: contrato do curso na frente do prompt (nomes canonicos + abordagem unica).
  // Texto IDENTICO ao contractHeader do spikeReadingModuleV2.mjs.
  const contractHeader = contract
    ? `CONTRATO DO CURSO (PRIORIDADE MÁXIMA — TODAS as aulas seguem isto para o projeto ficar coerente; se a modernização oferecer mais de uma abordagem, o contrato decide qual usar em TODO o curso):\n"""\n${contract}\n"""\n\n`
    : '';
  const { content, usage, model: usedModel } = await chatCompletion({
    system: READING_CONDENSE_SYSTEM,
    user: contractHeader + buildReadingCondensePrompt({ lessonTitle, transcript: text, instruction, sourceLanguage, clarity }),
    model,
    temperature: 0.3,
    // Generoso: grupos grandes (ate ~60k de input) precisam de saida longa pra
    // COBRIR tudo sem truncar a aula no meio.
    maxTokens: 14000,
  });
  return { text: content.trim(), usage, model: usedModel };
};

// fs: le as transcricoes do disco e pre-condensa (Qwen, inline) antes do DeepSeek.
// Usa cache persistente por conteudo: reprocessar nao re-condensa no Qwen.
const condenseLesson = async ({ lessonTitle, sources, model, instruction, language = 'pt', preCondenseOn, coursesPath, ensureQwen, normMap, clarity = false, contract = '', ocrVocabulary = [] }) => {
  const parts = [];
  for (const src of sources) {
    // Cada aula logica pode ter varias `parts` (original + complemento .1).
    for (const part of src.parts || [src]) {
      try {
        let text = await parseTranscript(part.path);
        // OCR ground-truth: corrige garble (ex.: /alf -> /auth) ancorado na tela.
        // Mesma correção que buildModulePrep aplica ao extrair fingerprints.
        if (ocrVocabulary.length && text) {
          const { text: corrected, map } = correctTranscriptWithOcr(text, ocrVocabulary);
          if (map.length) text = corrected;
        }
        parts.push(await preCondenseCached(text, preCondenseOn, coursesPath, ensureQwen));
      } catch {
        /* ignora transcricao ilegivel */
      }
    }
  }
  return condenseText({ lessonTitle, merged: parts.filter(Boolean).join('\n\n'), model, instruction, language, normMap, clarity, contract });
};

// F1 (normalizacao) + F4 (contrato + fingerprints p/ o planejador) por MODULO.
// Extrai o fingerprint de CADA transcript UMA vez (do texto CRU) e reusa:
//   - normMap (F1): collectNorm + vet dos fingerprints.
//   - contract (F4): sintetizado dos fingerprints + nicho (ou o `incomingContract`
//     por-curso, quando o lote ja produziu um).
//   - fingerprints: devolvidos p/ enriquecer o planejador.
// FIX A: extrai do texto CRU (`parseTranscript`), NAO do pre-condensado — a limpeza do
// Qwen apaga o garble. Degrada gracioso: off/Qwen fora -> tudo vazio.
// `readParts(t)` -> lista de textos crus (parseTranscript no fs, fetch no Drive).
const buildModulePrep = async ({ transcripts, readParts, preCondenseOn, normalizeOn, contractOn, incomingContract = '', ensureQwen, moduleTitle, instruction, model, log, ocrVocabulary = [], ocrDiagrams = [] }) => {
  const base = { normMap: [], fingerprints: [], contract: incomingContract, usages: [], ocrDiagrams };
  if (!preCondenseOn) return base;
  const needFp = normalizeOn || (contractOn && !incomingContract);
  if (!needFp) return base;
  // Espelha o preCondenseCached: se ha ensureQwen (lote), garante o Qwen; se nao ha
  // (1 modulo), assume que ja esta no ar (degrada se nao).
  if (ensureQwen && !(await ensureQwen())) { log('[reading] Qwen indisponivel; sem F1/F4 neste modulo.'); return base; }
  const fingerprints = [];
  for (const t of transcripts) {
    const raws = (await readParts(t)).filter(Boolean);
    fingerprints.push(raws.length ? await qwenExtract(raws.join('\n\n')) : '');
  }
  const usages = [];
  // F4 contrato PRIMEIRO — o normMap da F1 ancora nele (o /alf so morre com o contrato).
  let contract = incomingContract;
  if (contractOn && !contract) {
    const named = fingerprints.map((fp, i) => `${transcripts[i]?.title || ''}\n${fp}`);
    // OCR: injeta o vocabulário canônico (ground-truth da tela) e os diagramas
    // Mermaid no contrato — os nomes canônicos passam a vir do OCR, muito mais
    // confiáveis que o fingerprint ruidoso do Qwen.
    let ocrBlock = '';
    if (ocrVocabulary.length) {
      ocrBlock += `\nVOCABULÁRIO CANÔNICO (extraído via OCR da tela do vídeo — USE EXATAMENTE estes nomes; são a verdade da tela):\n${ocrVocabulary.slice(0, 200).join(', ')}\n`;
    }
    if (ocrDiagrams.length) {
      ocrBlock += `\nDIAGRAMAS (extraídos via OCR da tela do vídeo — reproduza fielmente):\n${ocrDiagrams.map((d) => d.mermaid).join('\n\n---\n\n')}\n`;
    }
    const c = await buildContract(named, instruction + (ocrBlock ? `\n\n${ocrBlock}` : ''), model);
    contract = c.text; if (c.usage) usages.push(c.usage);
    if (contract) log(`[contract] F4 gerado p/ "${moduleTitle}" (${contract.length} chars${ocrVocabulary.length ? `, OCR: ${ocrVocabulary.length} tokens` : ''})`);
  }
  // F1 normMap (vet) + correcao ANCORADA no contrato (F4).
  let normMap = [];
  if (normalizeOn) {
    const r = await normMapFromFingerprints({ fingerprints, contextTitle: moduleTitle, model, log, contract: contractOn ? contract : '' });
    normMap = r.map; if (r.usage) usages.push(r.usage);
  }
  return { normMap, fingerprints, contract, usages, ocrDiagrams };
};

// Gera o curso de leitura para UM modulo. Despacha pro modo do .env.
// `opts.preCondense` (boolean) liga/desliga o Qwen por execucao; quando undefined,
// cai no flag global PRECONDENSE_ENABLED do .env. `opts.normalize` idem, com o
// flag PRECOND_NORMALIZE_ENABLED (F1: corrige mis-transcricao; exige preCondense).
export const generateReadingModule = async (opts) => {
  const preCondenseOn = opts.preCondense ?? preCondenseEnabled();
  const normalizeOn = opts.normalize ?? normalizeEnabled();
  const clarityOn = opts.clarity ?? clarityEnabled();
  const contractOn = opts.contract ?? contractEnabled();
  // OCR: override por execucao (boolean) ou cai no flag do .env.
  // Set temporário pra ocrModule/ocrTextEnabled/ocrDiagramEnabled respeitarem.
  if (typeof opts.ocrText === 'boolean') process.env.OCR_TEXT_ENABLED = opts.ocrText ? '1' : '0';
  if (typeof opts.ocrDiagram === 'boolean') process.env.OCR_DIAGRAM_ENABLED = opts.ocrDiagram ? '1' : '0';
  if (preCondenseOn) {
    console.log('[reading] pre-condensacao local ATIVA — limpando transcricoes no modelo local antes do DeepSeek');
    opts.onProgress?.({ type: 'precondense', enabled: true });
  }
  if (normalizeOn && preCondenseOn) console.log('[reading] normalizacao de mis-transcricao ATIVA (F1)');
  if (clarityOn) console.log('[reading] modo CLAREZA ATIVO (F3)');
  if (contractOn && preCondenseOn) console.log('[reading] CONTRATO de curso ATIVO (F4)');
  if (opts.ocrVocabulary?.length) console.log(`[reading] OCR ATIVO — ${opts.ocrVocabulary.length} tokens canônicos, ${opts.ocrDiagrams?.length || 0} diagramas`);
  const isDrive = (process.env.COURSE_SOURCE || 'filesystem').trim() === 'drive';
  // `opts.contractText`: contrato JA sintetizado por-curso (vem do lote); se ausente,
  // o modulo sintetiza o seu (per-modulo).
  const shared = { ...opts, preCondenseOn, normalizeOn, clarityOn, contractOn, incomingContract: opts.contractText || '' };
  return isDrive ? generateReadingModuleDrive(shared) : generateReadingModuleFs(shared);
};

// === Fluxo EM LOTE com revezamento de VRAM (WhisperX vs Qwen) ===
// Fase 1: WhisperX transcreve TODOS os modulos (Qwen derrubado). Fase 2: sobe o
// Qwen UMA vez e pre-condensa TODAS as aulas (cache), depois derruba o Qwen.
// Fase 3: DeepSeek roda em tudo (remoto, sem VRAM) usando o cache.
//
// jobs: [{ courseTitle, modulePath, moduleTitle, index }]
export const generateReadingBatch = async ({
  coursesPath,
  jobs = [],
  model = DEFAULT_MODEL,
  instruction = '',
  autoTranscribe = true,
  language = 'pt',
  preCondense: preFlag,
  normalize: normFlag,
  clarity: clarityFlag,
  contract: contractFlag,
  ocrText: ocrTextFlag,
  ocrDiagram: ocrDiagramFlag,
  onProgress = () => {},
}) => {
  const isDrive = (process.env.COURSE_SOURCE || 'filesystem').trim() === 'drive';
  const preCondenseOn = preFlag ?? preCondenseEnabled();
  const normalizeOn = normFlag ?? normalizeEnabled();
  const clarityOn = clarityFlag ?? clarityEnabled();
  const contractOn = contractFlag ?? contractEnabled();
  // OCR: override por execucao (boolean) ou cai no flag do .env.
  const ocrTextOn = ocrTextFlag ?? ocrTextEnabled();
  const ocrDiagramOn = ocrDiagramFlag ?? ocrDiagramEnabled();
  // Set temporário dos flags pra ocrModule respeitar o override da UI.
  if (typeof ocrTextFlag === 'boolean') process.env.OCR_TEXT_ENABLED = ocrTextFlag ? '1' : '0';
  if (typeof ocrDiagramFlag === 'boolean') process.env.OCR_DIAGRAM_ENABLED = ocrDiagramFlag ? '1' : '0';
  const log = (m) => console.log(m);
  const transcriptionByJob = new Map();
  const results = [];

  // "auto": resolve o idioma UMA VEZ por curso (cacheado) e usa no curso inteiro;
  // cada curso novo e validado de novo. Fora de "auto", usa o idioma escolhido.
  const courseLang = new Map();
  const resolveLang = async (courseTitle) => {
    if (language !== 'auto') return language;
    if (!courseLang.has(courseTitle)) {
      const l = await detectCourseLanguageFs(coursesPath, courseTitle, log);
      courseLang.set(courseTitle, l);
      log(`[auto] curso "${courseTitle}" -> idioma ${l} (vale pro curso inteiro)`);
    }
    return courseLang.get(courseTitle);
  };

  // ---- FASE 1: WhisperX (so faz sentido no modo filesystem) ----
  if (autoTranscribe && !isDrive) {
    onProgress({ type: 'phase', phase: 'whisper', status: 'start' });
    // Garante a GPU livre pro WhisperX: derruba o Qwen (manual ou nosso).
    try { await stopQwen({ log }); } catch (err) { log(`[qwen] stop falhou: ${err.message}`); }
    for (const job of jobs) {
      const tag = { courseTitle: job.courseTitle, module: job.moduleTitle, modulePath: job.modulePath };
      onProgress({ type: 'transcricao', ...tag, status: 'start' });
      let summary;
      try {
        const moduleDir = join(coursesPath, job.courseTitle, job.modulePath);
        summary = await transcribeMissingTranscripts(moduleDir, await resolveLang(job.courseTitle));
      } catch (err) {
        summary = { transcribed: 0, failed: [{ file: job.moduleTitle, error: err.message }], skipped: false };
      }
      transcriptionByJob.set(job.modulePath, summary);
      onProgress({ type: 'transcricao', ...tag, status: 'done', ...summary });
    }
    onProgress({ type: 'phase', phase: 'whisper', status: 'done' });
  }

  // ---- FASE 1.5: OCR (entre WhisperX e pré-condensação) ----
  // PaddleOCR (CPU) + Qwen3-VL (GPU) extraem vocabulário canônico + diagramas
  // dos vídeos de cada módulo. O vocabulário corrige o garble do WhisperX na
  // fonte (antes da pré-condensação) e alimenta o contrato (F4).
  // Cache por vídeo: roda 1× por vídeo. Degrada gracioso se off/falha.
  const ocrByJob = new Map();
  const ocrOn = ocrTextOn || ocrDiagramOn;
  if (ocrOn && !isDrive) {
    onProgress({ type: 'phase', phase: 'ocr', status: 'start' });
    // PaddleOCR roda no CPU (não disputa VRAM); VL derruba o Qwen texto e sobe.
    for (const job of jobs) {
      const tag = { courseTitle: job.courseTitle, module: job.moduleTitle, modulePath: job.modulePath };
      onProgress({ type: 'ocr', ...tag, status: 'start' });
      try {
        const moduleDir = join(coursesPath, job.courseTitle, job.modulePath);
        const ocr = await runOcrForModule(moduleDir, coursesPath, log, (p) => {
          onProgress({ type: 'ocr', ...tag, status: 'progress', video: p.video, videoIndex: p.index, videoTotal: p.total });
        });
        ocrByJob.set(job.modulePath, ocr);
        onProgress({ type: 'ocr', ...tag, status: 'done', vocabulary: ocr.vocabulary.length, diagrams: ocr.diagrams.length });
      } catch (err) {
        log(`[ocr] erro no módulo ${job.moduleTitle}: ${err.message}`);
        onProgress({ type: 'ocr', ...tag, status: 'error', error: err.message });
      }
    }
    // Derruba o VL (se subiu) pra liberar VRAM pro Qwen texto na fase 2
    try {
      const { stopVl } = await import('./ocr/visionServer.mjs');
      await stopVl({ log: () => {} });
    } catch {}
    onProgress({ type: 'phase', phase: 'ocr', status: 'done' });
  }

  // ---- FASE 2: leitura MODULO A MODULO ----
  // Processa modulo a modulo (pre-condensa as aulas e ja vai pro DeepSeek + escreve
  // ANTES do proximo) — nao segura tudo na RAM. O Qwen sobe SOB DEMANDA e SO se
  // for realmente preciso condensar algo novo (cache miss): `ensureQwen` e
  // memoizado e chamado la dentro, no 1o miss. Se tudo estiver em cache (ex.:
  // reprocesso), o Qwen NEM SOBE. Uma vez no ar, fica ate o fim do lote (o
  // DeepSeek e remoto, sem VRAM) e e derrubado no finally.
  let qwenStarted = false;
  let qwenTried = false;
  const ensureQwen = async () => {
    if (qwenStarted) return true;
    if (qwenTried) return false; // ja tentou e falhou: nao re-tenta a cada aula
    qwenTried = true;
    try {
      await startQwen({ log });
      qwenStarted = true;
      return true;
    } catch (err) {
      log(`[qwen] nao subiu (${err.message}); seguindo SEM pre-condensacao`);
      onProgress({ type: 'precondense', status: 'unavailable', error: err.message });
      return false;
    }
  };

  onProgress({ type: 'phase', phase: 'deepseek', status: 'start' });
  try {
    for (const job of jobs) {
      const tag = { courseTitle: job.courseTitle, module: job.moduleTitle, modulePath: job.modulePath };
      onProgress({ type: 'module-start', ...tag });
      // Repassa precondense/plano/aula do modulo (transcricao ja foi na fase 1).
      const moduleProgress = (ev) => {
        if (ev.type === 'precondense') onProgress({ type: 'precondense', ...tag, status: 'start' });
        else if (ev.type === 'plano' || ev.type === 'aula') onProgress({ ...ev, ...tag });
      };
      try {
        // Idioma da condensacao: se "auto" ja foi resolvido pro curso (fase 1, fs),
        // usa o resolvido; senao (ex.: Drive) mantem "auto" e detecta por aula.
        const condLang = courseLang.get(job.courseTitle) ?? language;
        const out = await generateReadingModule({
          coursesPath,
          courseTitle: job.courseTitle,
          modulePath: job.modulePath,
          moduleTitle: job.moduleTitle,
          index: job.index,
          model,
          instruction,
          autoTranscribe: false, // ja transcrito na fase 1
          language: condLang,
          preCondense: preCondenseOn, // usa o cache; sobe o Qwen so no 1o miss real
          normalize: normalizeOn, // F1: normalizacao de mis-transcricao por modulo
          clarity: clarityOn, // F3: modo clareza
          contract: contractOn, // F4: contrato (per-modulo; per-curso = TD-14)
          ocrVocabulary: ocrByJob.get(job.modulePath)?.vocabulary || [], // OCR: correção ground-truth
          ocrDiagrams: ocrByJob.get(job.modulePath)?.diagrams || [], // OCR: Mermaid fiel
          ensureQwen,
          onProgress: moduleProgress,
        });
        if (transcriptionByJob.has(job.modulePath)) out.transcription = transcriptionByJob.get(job.modulePath);
        results.push({ courseTitle: job.courseTitle, modulePath: job.modulePath, ...out });
        onProgress({ type: 'module-result', ...tag, result: out });
      } catch (err) {
        results.push({ courseTitle: job.courseTitle, modulePath: job.modulePath, error: err.message });
        onProgress({ type: 'module-error', ...tag, error: err.message });
      }
    }
  } finally {
    // Derruba o Qwen SO se ele chegou a subir (libera a GPU p/ o Kokoro depois).
    if (qwenStarted) { try { await stopQwen({ log }); } catch (err) { log(`[qwen] stop falhou: ${err.message}`); } }
  }
  onProgress({ type: 'phase', phase: 'deepseek', status: 'done' });
  return results;
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
  preCondenseOn = false,
  normalizeOn = false,
  clarityOn = false,
  contractOn = false,
  incomingContract = '',
  ocrVocabulary = [],
  ocrDiagrams = [],
  ensureQwen,
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

  // Fase 0.5: OCR dos vídeos do módulo (se ligado e não vier do lote).
  // No lote, o OCR já rodou na fase 1.5 e o vocabulário chega via opts.
  // No fluxo individual, roda aqui.
  const ocrVocab = ocrVocabulary || [];
  const ocrDiags = ocrDiagrams || [];
  if ((!ocrVocab.length && !ocrDiags.length) && (ocrTextEnabled() || ocrDiagramEnabled())) {
    onProgress({ type: 'ocr', status: 'start' });
    try {
      const ocr = await runOcrForModule(moduleDir, coursesPath, (m) => console.log(m), (p) => {
        onProgress({ type: 'ocr', status: 'progress', video: p.video, videoIndex: p.index, videoTotal: p.total });
      });
      ocrVocab.push(...ocr.vocabulary);
      ocrDiags.push(...ocr.diagrams);
      onProgress({ type: 'ocr', status: 'done', vocabulary: ocrVocab.length, diagrams: ocrDiags.length });
    } catch (err) {
      console.log(`[ocr] erro no módulo: ${err.message}`);
      onProgress({ type: 'ocr', status: 'error', error: err.message });
    }
    // Derruba o VL (se subiu) pra liberar VRAM pro Qwen texto
    try { const { stopVl } = await import('./ocr/visionServer.mjs'); await stopVl({ log: () => {} }); } catch {}
  }

  const transcripts = await collectModuleTranscripts(moduleDir);
  if (transcripts.length === 0) {
    onProgress({ type: 'plano', total: 0 });
    return { module: moduleTitle, skipped: 'sem transcricoes', transcription, created: [], originalLessons: 0 };
  }

  // F1+F4 prep: fingerprint por aula (uma vez) -> normMap (F1) + contrato (F4) +
  // fingerprints p/ o planejador enriquecido. Off/Qwen fora -> vazios (comportamento antigo).
  // OCR: o vocabulário canônico (ground-truth da tela) corrige o garble do WhisperX
  // no texto CRU antes de tudo — beneficia leitura, prática, quiz, flashcards.
  const prep = await buildModulePrep({
    transcripts, preCondenseOn, normalizeOn, contractOn, incomingContract, ensureQwen,
    moduleTitle, instruction, model, log: (m) => console.log(m),
    ocrVocabulary: ocrVocab, ocrDiagrams: ocrDiags,
    readParts: async (t) => {
      const out = [];
      for (const part of t.parts || [t]) {
        try {
          let text = await parseTranscript(part.path);
          // OCR ground-truth: corrige garble (ex.: /alf -> /auth) ancorado na tela.
          if (ocrVocab.length && text) {
            const { text: corrected, map } = correctTranscriptWithOcr(text, ocrVocab, { log: (m) => console.log(m) });
            if (map.length) text = corrected;
          }
          out.push(text);
        } catch { /* ilegivel */ }
      }
      return out;
    },
  });
  const { normMap, fingerprints, contract } = prep;
  if (normMap.length) onProgress({ type: 'normalize', applied: normMap });
  if (contract) onProgress({ type: 'contract', chars: contract.length });

  const { plan, usage: planUsage } = await planGrouping({ moduleTitle, transcripts, model, fingerprints });
  onProgress({ type: 'plano', total: plan.length });

  const outRoot = join(coursesPath, `${courseTitle} - Leitura`);
  const readingCourseTitle = `${courseTitle} - Leitura`;
  const moduleFolderName = safeName(cleanModuleTitle(moduleTitle));
  const outDir = join(outRoot, `${pad2(index)} ${moduleFolderName}`);

  // Re-rodar deve ser 100% idempotente: remove QUALQUER pasta anterior deste
  // modulo (mesmo com numero diferente — o indice ou o agrupamento podem ter
  // mudado) e apaga TODOS os materiais orfaos correspondentes no banco. Assim
  // nao duplica pasta nem deixa lixo no Supabase.
  try {
    for (const d of await fs.readdir(outRoot)) {
      if (!/^\d+\s/.test(d) || d.replace(/^\d+\s+/, '') !== moduleFolderName) continue;
      const oldDir = join(outRoot, d);
      try {
        for (const f of await fs.readdir(oldDir)) {
          const m = f.match(TRANSCRIPT_RE);
          if (!m) continue;
          await purgeLessonDb(readingCourseTitle, f.slice(0, m.index));
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
      const out = await condenseLesson({ lessonTitle: title, sources, model, instruction, language, preCondenseOn, coursesPath, ensureQwen, normMap, clarity: clarityOn, contract, ocrVocabulary: ocrVocab });
      if (!out) {
        res = { title, ok: false, error: 'transcricao vazia' };
      } else {
        const fileTitle = `${pad2(idx + 1)} ${safeName(title)}`;
        const fileName = `${fileTitle}_dub.txt`;
        await fs.writeFile(join(outDir, fileName), out.text, 'utf8');
        // REGRA: ao (re)gerar uma aula de leitura, zera TODO material desse prefixo
        // antes — independente de como foi criado (Gerar IA, modo Drive, etc.).
        // Sem isso, material da era-Drive/de "Gerar IA" ficava de resquicio (ex.:
        // podcast) quando o scan de pasta do modo atual nao achava os arquivos.
        await purgeLessonDb(readingCourseTitle, fileTitle);
        try {
          await query(
            `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
             VALUES ($1, $2, 'resumo', $3)
             ON CONFLICT (course_title, lesson_prefix, kind)
             DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
            [readingCourseTitle, fileTitle, out.text],
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

  // Custo DeepSeek do modulo (USD): plano + prep (vet F1 + contrato F4) + condensacao.
  let cost = costFromUsage(planUsage, model);
  for (const u of prep.usages) cost += costFromUsage(u, model);
  for (const c of created) if (c.ok && c.usage) cost += costFromUsage(c.usage, model);

  return { module: moduleTitle, outDir, transcription, created, originalLessons: transcripts.length, cost };
};

// Versao Drive. modulePath = id da pasta do modulo no Drive (vem da arvore).
// Le transcricoes que JA existem no Drive, condensa/traduz e sobe os .txt na
// pasta "<curso> - Leitura". WhisperX nao roda aqui (exigiria baixar os videos):
// aulas sem .txt sao puladas.
const generateReadingModuleDrive = async ({
  coursesPath, courseTitle, modulePath, moduleTitle, index = 1,
  model = DEFAULT_MODEL, instruction = '', language = 'pt',
  preCondenseOn = false, normalizeOn = false, clarityOn = false,
  contractOn = false, incomingContract = '',
  ocrVocabulary = [], ocrDiagrams = [],
  ensureQwen, onProgress = () => {},
}) => {
  const drive = await import('../drive/index.js');
  const { getDriveFolderId } = await import('../config.js');
  const rootId = getDriveFolderId();
  if (!rootId) throw new Error('DRIVE_COURSES_FOLDER_ID nao configurado');

  const moduleFolderId = modulePath;
  const transcription = { transcribed: 0, failed: [], skipped: true };
  onProgress({ type: 'transcricao', status: 'done', ...transcription });

  const files = drive.flattenFiles(await drive.listFilesRecursive(moduleFolderId));
  const driveFiles = files
    .filter((f) => TRANSCRIPT_RE.test(f.name) && !MATERIAL_TXT_RE.test(f.name))
    .map((f) => ({ name: f.name, fileId: f.id, title: lessonTitleFromFile(f.name), bytes: Number(f.size) || 0 }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  // Funde complementos (X.Y.1 -> X.Y) em aulas logicas antes do plano.
  const transcripts = mergeComplements(driveFiles).map((t, id) => ({ id, ...t }));
  if (transcripts.length === 0) {
    onProgress({ type: 'plano', total: 0 });
    return { module: moduleTitle, skipped: 'sem transcricoes', transcription, created: [], originalLessons: 0 };
  }

  // F1+F4 prep (le do Drive; o condense re-le, cache do precondense cobre a parte cara).
  // OCR: correção ground-truth no texto cru antes da pré-condensação (igual ao fs).
  const ocrVocab = ocrVocabulary || [];
  const ocrDiags = ocrDiagrams || [];
  const prep = await buildModulePrep({
    transcripts, preCondenseOn, normalizeOn, contractOn, incomingContract, ensureQwen,
    moduleTitle, instruction, model, log: (m) => console.log(m),
    ocrVocabulary: ocrVocab, ocrDiagrams: ocrDiags,
    readParts: async (t) => {
      const out = [];
      for (const part of t.parts || [t]) {
        try {
          let text = parseTranscriptRaw(await drive.getFileContent(part.fileId), /\.vtt$/i.test(part.name));
          if (ocrVocab.length && text) {
            const { text: corrected, map } = correctTranscriptWithOcr(text, ocrVocab, { log: (m) => console.log(m) });
            if (map.length) text = corrected;
          }
          out.push(text);
        } catch { /* ilegivel */ }
      }
      return out;
    },
  });
  const { normMap, fingerprints, contract } = prep;
  if (normMap.length) onProgress({ type: 'normalize', applied: normMap });
  if (contract) onProgress({ type: 'contract', chars: contract.length });

  const { plan, usage: planUsage } = await planGrouping({ moduleTitle, transcripts, model, fingerprints });
  onProgress({ type: 'plano', total: plan.length });

  const readingCourseTitle = `${courseTitle} - Leitura`;
  const leituraRootId = await drive.ensureSubfolder(rootId, readingCourseTitle);
  const cleanPart = safeName(cleanModuleTitle(moduleTitle));
  const moduleFolderName = `${pad2(index)} ${cleanPart}`;

  // Idempotente: remove pasta(s) antiga(s) deste modulo + materiais orfaos no DB.
  try {
    for (const d of await drive.listFolders(leituraRootId)) {
      if (!/^\d+\s/.test(d.name) || d.name.replace(/^\d+\s+/, '') !== cleanPart) continue;
      try {
        const old = drive.flattenFiles(await drive.listFilesRecursive(d.id));
        for (const f of old) {
          const m = f.name.match(TRANSCRIPT_RE);
          if (!m) continue;
          await purgeLessonDb(readingCourseTitle, f.name.slice(0, m.index));
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
      let totalParts = 0;
      for (const s of sources) {
        // Cada aula logica pode ter varias `parts` (original + complemento .1).
        for (const part of s.parts || [s]) {
          totalParts += 1;
          try {
            let raw = parseTranscriptRaw(await drive.getFileContent(part.fileId), /\.vtt$/i.test(part.name));
            // OCR ground-truth: corrige garble ancorado na tela (igual ao fs).
            if (ocrVocab.length && raw) {
              const { text: corrected, map } = correctTranscriptWithOcr(raw, ocrVocab);
              if (map.length) raw = corrected;
            }
            // Pre-condensacao com cache persistente (no-op se desligada/indisponivel).
            parts.push(await preCondenseCached(raw, preCondenseOn, coursesPath, ensureQwen));
          } catch { readErrors += 1; }
        }
      }
      // Se havia fontes e NENHUMA foi lida, foi erro de leitura (Drive), nao aula
      // vazia: falha visivel (com mensagem) em vez de sumir silenciosamente.
      if (parts.length === 0 && totalParts > 0) {
        throw new Error(`falha ao ler ${readErrors}/${totalParts} transcricao(oes) no Drive`);
      }
      const out = await condenseText({
        lessonTitle: title, merged: parts.filter(Boolean).join('\n\n'), model, instruction, language, normMap, clarity: clarityOn, contract,
      });
      if (!out) {
        res = { title, ok: false, error: 'transcricao vazia' };
      } else {
        const fileTitle = `${pad2(idx + 1)} ${safeName(title)}`;
        const fileName = `${fileTitle}_dub.txt`;
        await drive.uploadText(outFolderId, fileName, out.text);
        // REGRA: zera TODO material desse prefixo antes (ver fs). Garante que (re)gerar
        // a leitura nao deixa resquicio (podcast etc.) de Gerar IA / modo anterior.
        await purgeLessonDb(readingCourseTitle, fileTitle);
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

  // Custo DeepSeek do modulo (USD): plano + prep (vet F1 + contrato F4) + condensacao.
  let cost = costFromUsage(planUsage, model);
  for (const u of prep.usages) cost += costFromUsage(u, model);
  for (const c of created) if (c.ok && c.usage) cost += costFromUsage(c.usage, model);

  return { module: moduleTitle, outFolderId, transcription, created, originalLessons: transcripts.length, cost };
};
