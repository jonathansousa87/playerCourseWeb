// Narracao "read-along" de uma aula de leitura: pega o conteudo da LEITURA
// (lesson_materials kind='resumo'), narra SO a prosa (titulos, paragrafos, itens
// de lista, citacoes) com o Kokoro — PULANDO codigo, diagramas Mermaid e tabelas
// — e concatena tudo num mp3. Grava { audio, segments, voice } em
// lesson_materials kind='narracao'. `segments` = [{ start, end }] na MESMA ordem
// dos elementos de texto renderizados (o front casa por ordem, sem mexer no
// layout). Sem DeepSeek: custo zero, so TTS local.

import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { ensureServer, synthesize, phonemizeText, synthesizeFromPhonemes } from './kokoro.js';
import { loadTranscriptForLesson } from './generator.js';
import { query } from '../../db/index.js';
import { loadPhonemeCache, getPhoneme, setPhoneme, savePhonemeCache } from './ttsPhonemeStore.js';

// Voz padrao = preset JUNIOR do podcast (configuravel por env).
const VOICE = () => (process.env.NARRATION_VOICE || process.env.PODCAST_VOICE_JUNIOR || 'pf_dora+bf_lily+if_sara').trim();
const MAX_TTS_CHARS = 400;
const truthy = (v) => /^(1|true|yes|on)$/i.test((v || '').trim());
export const phonemeSpliceEnabled = () => truthy(process.env.NARRATION_PHONEME_SPLICE_ENABLED);

const ffprobeDur = (file) =>
  new Promise((res) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('close', () => res(parseFloat(out.trim()) || 0));
    p.on('error', () => res(0));
  });

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let e = '';
    proc.stderr.on('data', (d) => { e += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg falhou (${c}): ${e.slice(-300)}`))));
  });

// Markdown -> texto falavel (tira marcacao, deixa o texto).
const stripMd = (s) =>
  String(s)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/\s+/g, ' ')
    .trim();

// Quebra a aula nos MESMOS blocos de texto que o ReactMarkdown renderiza, NA
// ORDEM do documento: heading / paragrafo / item de lista / citacao. Pula blocos
// de codigo (``` e ```mermaid/flow) e tabelas — eles aparecem na pagina, mas nao
// sao narrados. Retorna [{ text }] (so prosa, em ordem).
// So narra blocos com PALAVRA de verdade — um bloco sem letra (ex.: a regua "---"
// ou so pontuacao) NAO e falavel e quebra o Kokoro ("list index out of range").
const hasWord = (s) => /[\p{L}]/u.test(s || '');

// --- Soletrar siglas (so no audio; o texto exibido/sync continua com "JPA") ---
// O Kokoro le "JPA" como "spa"; aqui trocamos pela grafia fonetica pt-BR
// ("jota pe a"). So vale pra narracao (o podcast ja resolve isso no prompt do LLM).
const LETTER_PT = {
  A: 'á', B: 'bê', C: 'cê', D: 'dê', E: 'é', F: 'éfe', G: 'gê', H: 'agá', I: 'i',
  J: 'jota', K: 'cá', L: 'éle', M: 'ême', N: 'êne', O: 'ó', P: 'pê', Q: 'quê',
  R: 'érre', S: 'esse', T: 'tê', U: 'u', V: 'vê', W: 'dáblio', X: 'xis', Y: 'ípsilon', Z: 'zê',
};
const spellOut = (a) => a.toUpperCase().split('').map((c) => LETTER_PT[c] || c).join(' ');

// Abordagem GENERICA (vale p/ qualquer nicho): pela distincao linguistica
// initialism vs acronym, TODA sigla em CAIXA ALTA (2-6 letras) e SOLETRADA por
// padrao (initialism: JPA, SQL, HTTP, API, CEO, CNN, RM, JPQL...). A EXCECAO sao
// as lidas como PALAVRA (acronym: REST, JSON, NASA, BERT, EBITDA...), que ficam
// intactas. Assim nao dependemos de uma lista do que soletrar (impossivel de
// cobrir entre nichos) — so mantemos a allowlist (curta) das que sao palavra,
// extensivel por env NARRATION_WORD_ACRONYMS (separada por virgula).
const WORD_ACRONYMS = new Set(
  ['REST', 'JSON', 'SOAP', 'SAGA', 'YAML', 'TOML', 'AJAX', 'CORS', 'CRUD', 'SPA', 'JPEG', 'GIF',
    'NASA', 'NATO', 'OTAN', 'ASCII', 'UNIX', 'LINUX', 'BIOS', 'RAID', 'WIFI', 'PIX', 'COVID',
    'AIDS', 'LASER', 'RADAR', 'SCRUM', 'KANBAN', 'DEVOPS', 'BERT', 'EBITDA', 'OAUTH', 'OK',
    // Verbos HTTP: sao FALADOS como palavra ("get", "post"), nao soletrados (g-e-t).
    'GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'HEAD', 'TRACE']
    .concat((process.env.NARRATION_WORD_ACRONYMS || '').split(',').map((s) => s.trim().toUpperCase()))
    .filter(Boolean),
);
// `\b([A-Z]{2,6})(s)?\b`: pega sigla MAIUSCULA com plural opcional (APIs, DTOs);
// o \b evita pegar prefixo de palavra CamelCase (ex.: nao casa "OA" em "OAuth").
const ACRO_RE = /\b([A-Z]{2,6})(s)?\b/g;
const speakable = (text) => String(text)
  // Seta de chamada (cliente → servidor, metodo → metodo): o Kokoro leria o
  // simbolo "→"; aqui vira a palavra "chama". Cobre a seta unicode e o "->" ascii.
  .replace(/\s*(?:→|⇒|->)\s*/g, ' chama ')
  // Marcador de resposta/pergunta de Q&A: "R:" o Kokoro le so "érre"; expande p/
  // "Resposta:"/"Pergunta:". So quando isolado (inicio ou apos espaco), p/ nao
  // pegar "HR:" nem ":" de codigo.
  .replace(/(^|\s)R:(?=\s|$)/g, '$1Resposta:')
  .replace(/(^|\s)P:(?=\s|$)/g, '$1Pergunta:')
  .replace(ACRO_RE, (m, acro, plural) =>
    (WORD_ACRONYMS.has(acro) ? m : spellOut(acro) + (plural ? 's' : '')));

// Tabela markdown -> blocos falaveis, UMA linha por vez, INCLUINDO o cabecalho
// (antes a tabela era pulada). Cada celula vira "celula1, celula2, ...". A linha
// separadora (|---|---|) e descartada. Celulas mantidas se tiverem letra OU
// numero (p/ nao perder "200", "404" numa tabela de status).
const hasContent = (s) => /[\p{L}\p{N}]/u.test(s || '');
const splitCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isSepRow = (cells) => cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
const tableToBlocks = (rows) => {
  const out = [];
  for (const line of rows) {
    const cells = splitCells(line);
    if (isSepRow(cells)) continue;
    const spoken = cells.map((c) => stripMd(c)).filter(hasContent).join(', ');
    if (hasContent(spoken)) out.push({ text: spoken });
  }
  return out;
};

const parseNarratableBlocks = (md) => {
  const lines = String(md || '').split(/\r?\n/);
  const blocks = [];
  let para = null;
  const flushPara = () => {
    if (para) { const x = stripMd(para); if (x && hasWord(x)) blocks.push({ text: x }); para = null; }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (/^```/.test(t) || /^~~~/.test(t)) { // fenced code/mermaid/flow -> pula ate fechar
      flushPara();
      const fence = t.slice(0, 3);
      i++;
      while (i < lines.length && lines[i].trim().slice(0, 3) !== fence) i++;
      continue;
    }
    if (t === '') { flushPara(); continue; }
    if (/^([*_-])\1{2,}\s*$/.test(t)) { flushPara(); continue; } // regua horizontal (--- *** ___) -> nao narra
    if (/^\s*\|/.test(raw)) { // tabela -> narra linha a linha (cabecalho incluso)
      flushPara();
      const tbl = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { tbl.push(lines[i]); i++; }
      i--; // o for faz i++ de novo
      for (const b of tableToBlocks(tbl)) blocks.push(b);
      continue;
    }
    if (/^#{1,6}\s+/.test(t)) { flushPara(); const x = stripMd(t); if (x && hasWord(x)) blocks.push({ text: x }); continue; }
    if (/^\s*([-*+]|\d+\.)\s+/.test(raw)) { flushPara(); const x = stripMd(t); if (x && hasWord(x)) blocks.push({ text: x }); continue; }
    // Paragrafo (acumula linhas). Citacao (>) entra como paragrafo: o ReactMarkdown
    // renderiza o conteudo da blockquote num <p>, entao casa 1-a-1 na ordem.
    const line = t.replace(/^>\s?/, '');
    para = para ? `${para} ${line}` : line;
  }
  flushPara();
  return blocks;
};

// Quebra texto longo em pedacos <= MAX_TTS_CHARS por frase (Kokoro degrada em
// textos longos). Cada pedaco vira um clip; concatenados na ordem.
const splitForTTS = (text) => {
  const t = String(text).trim();
  if (t.length <= MAX_TTS_CHARS) return [t];
  const sentences = t.match(/[^.!?]+[.!?]*\s*/g) || [t];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length > MAX_TTS_CHARS) {
      if (cur) chunks.push(cur.trim());
      cur = s.trim();
    } else {
      cur = (cur + ' ' + s).trim();
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter(Boolean);
};

const mapPool = async (items, limit, fn) => {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

// === Normalizacao de pronuncia por FONEMA SPLICING (NARRATION_PHONEME_SPLICE_ENABLED) ===
// Termo tecnico capitalizado fora do inicio da frase (ex.: RequestBody, Controller,
// Spring) tende a ser lido com sotaque portugues errado pelo Kokoro. Em vez de uma
// LLM reescrever a grafia (testado, ficou pior — ex. "RequestBody" virou
// "Requestybódi"), fonemizamos o termo em INGLES de verdade (Kokoro /dev/phonemize)
// e colamos no meio do fonema PORTUGUES do resto da frase. Deteccao automatica (sem
// lista manual por termo), filtrada por um dicionario PT-BR real (hunspell) pra nao
// aplicar sotaque ingles em palavra que E portugues (titulo/tabela capitalizam TUDO,
// nao so termo tecnico — ex.: "Atualiza"/"Precisamos" eram falso positivo).
// Validado em spike (server/ai/spikeTtsPhonemeSplice.mjs) — usuario confirmou ouvindo
// a aula real. Aqui e a MESMA logica, virando producao.
const ALLCAPS_RE = /^[A-Z]{2,6}$/; // sigla curta -> ja soletrada por speakable(), nao mexe
const CAP_WORD_RE = /\b[A-Z][\p{L}0-9]{2,}\b/gu; // \p{L} unicode: sem isso "Exclusão" truncava em "Exclus"
const HUNSPELL_DICT = (process.env.HUNSPELL_PT_BR_DICT
  || join(dirname(fileURLToPath(import.meta.url)), 'dict', 'pt_BR')).trim();

const findTechTermSpans = (text, ptMap = new Map()) => {
  const spans = [];
  const sentenceRe = /[^.!?]+[.!?]*\s*/g;
  let m;
  while ((m = sentenceRe.exec(text))) {
    const sentence = m[0];
    const sentStart = m.index;
    const trimmedOffset = sentence.length - sentence.trimStart().length;
    CAP_WORD_RE.lastIndex = 0;
    let cm;
    while ((cm = CAP_WORD_RE.exec(sentence))) {
      if (cm.index <= trimmedOffset) continue; // 1a palavra da frase -> pula
      const word = cm[0];
      if (ALLCAPS_RE.test(word)) continue; // sigla -> speakable() ja trata
      if (ptMap.get(word)) continue; // hunspell reconhece como PT -> nao e termo tecnico
      spans.push({ start: sentStart + cm.index, end: sentStart + cm.index + word.length, word });
    }
  }
  return spans;
};

const collectCandidateWords = (texts) => {
  const set = new Set();
  for (const text of texts) for (const s of findTechTermSpans(text, new Map())) set.add(s.word);
  return [...set];
};

// Classifica palavras como portugues (batch, 1 chamada hunspell pra todas). Falha do
// hunspell (binario ausente etc.) -> mapa vazio, tudo vira candidato a termo tecnico
// (degrada pro comportamento de antes do filtro, nao trava a narracao).
const classifyPortuguese = (words) => new Promise((resolve) => {
  if (!words.length) return resolve(new Map());
  let p;
  try { p = spawn('hunspell', ['-d', HUNSPELL_DICT, '-i', 'utf-8']); } catch { return resolve(new Map()); }
  let out = '';
  p.stdout.on('data', (d) => { out += d.toString(); });
  p.on('error', () => resolve(new Map()));
  p.on('close', () => {
    const blocks = out.split('\n\n');
    const map = new Map();
    words.forEach((w, i) => {
      const block = (blocks[i] || '').replace(/^Hunspell[^\n]*\n?/, '').trim();
      map.set(w, block.startsWith('*') || block.startsWith('+') || block.startsWith('-'));
    });
    resolve(map);
  });
  p.stdin.write(words.join('\n') + '\n');
  p.stdin.end();
});

// Fonemiza um bloco PT, trocando termo tecnico detectado pelo fonema em INGLES
// (cacheado em ttsPhonemeStore). Retorna a string de fonemas combinada.
const phonemizeSpliced = async (text, ptMap, cache) => {
  const phonemizeCached = async (t, language) => {
    const hit = getPhoneme(cache, t, language);
    if (hit) return hit;
    const p = await phonemizeText({ text: t, language });
    setPhoneme(cache, t, language, p);
    return p;
  };
  const spans = findTechTermSpans(text, ptMap);
  if (!spans.length) return phonemizeCached(text, 'p');
  const parts = [];
  let cursor = 0;
  for (const s of spans) {
    const before = text.slice(cursor, s.start);
    if (before.trim()) parts.push(await phonemizeCached(before, 'p'));
    parts.push(await phonemizeCached(s.word, 'a'));
    cursor = s.end;
  }
  const after = text.slice(cursor);
  if (after.trim()) parts.push(await phonemizeCached(after, 'p'));
  return parts.filter(Boolean).join(' ');
};

export const generateLessonNarration = async ({ coursesPath, courseTitle, lessonPrefix, voice }) => {
  // Fonte = a propria LEITURA (resumo) salva no banco.
  const rows = await query(
    "SELECT content FROM lesson_materials WHERE course_title = $1 AND lesson_prefix = $2 AND kind = 'resumo'",
    [courseTitle, lessonPrefix],
  );
  const content = rows.rows[0]?.content;
  if (!content) { const e = new Error('leitura (resumo) nao encontrada para narrar'); e.code = 'NO_CONTENT'; throw e; }

  const blocks = parseNarratableBlocks(content);
  if (blocks.length === 0) { const e = new Error('nada para narrar (so codigo/diagramas?)'); e.code = 'EMPTY'; throw e; }

  // Kokoro fala o TITULO da aula primeiro (deriva do prefixo, tira o NN da frente —
  // igual ao titulo mostrado na pagina). Vira o bloco 0; o front nao realca nada nesse
  // trecho (o titulo fica fora do articleRef), so a voz o anuncia. speakable() cuida de
  // siglas no titulo (ex.: "JWT").
  const lessonTitle = String(lessonPrefix || '').replace(/^\d+\s*/, '').trim();
  if (lessonTitle && hasWord(lessonTitle)) blocks.unshift({ text: lessonTitle });

  // Onde gravar o mp3 (pasta da aula). ref = caminho (fs) ou fileId (drive).
  const { ref } = await loadTranscriptForLesson({ courseTitle, lessonPrefix, coursesPath });
  const usedVoice = (voice || VOICE()).trim();
  const isDrive = (process.env.COURSE_SOURCE || 'filesystem').trim() === 'drive';

  await ensureServer();

  // Lista plana de chunks (cada bloco pode virar varios), preservando o indice do bloco.
  const segsFlat = [];
  blocks.forEach((b, bi) => { for (const piece of splitForTTS(b.text)) segsFlat.push({ blockIdx: bi, text: piece }); });

  // Normalizacao por fonema (opt-in): classifica termo tecnico x portugues UMA vez pra
  // todos os chunks (1 chamada hunspell), carrega o cache de fonemas do curso. Se algo
  // falhar no meio (endpoint /dev/* indisponivel), desliga pro resto desta narracao e
  // cai no caminho de texto puro de sempre — nunca aborta a narracao por causa disso.
  const spliceOn = phonemeSpliceEnabled();
  let spliceUsable = spliceOn;
  let ptMap = new Map();
  let phonemeCache = new Map();
  if (spliceOn) {
    const spoken = segsFlat.map((s) => speakable(s.text));
    ptMap = await classifyPortuguese(collectCandidateWords(spoken));
    phonemeCache = await loadPhonemeCache(coursesPath);
  }

  const work = join(tmpdir(), `narr-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  try {
    const clips = new Array(segsFlat.length); // { path, dur }
    await mapPool(segsFlat, 4, async (seg, i) => {
      const spoken = speakable(seg.text);
      let wav;
      if (spliceUsable) {
        try {
          const phon = await phonemizeSpliced(spoken, ptMap, phonemeCache);
          wav = await synthesizeFromPhonemes({ phonemes: phon, voice: usedVoice });
        } catch (e) {
          console.warn(`[narracao] fonema splice indisponível (${e.message}); caindo pro texto puro pro resto da aula`);
          spliceUsable = false;
        }
      }
      if (!wav) wav = await synthesize({ text: spoken, voice: usedVoice, langCode: 'p' });
      const clipPath = join(work, `c_${String(i).padStart(4, '0')}.wav`);
      await fs.writeFile(clipPath, wav);
      clips[i] = { path: clipPath, dur: await ffprobeDur(clipPath) };
    });
    if (clips.some((c) => !c)) { const e = new Error('falha sintetizando algum trecho'); e.code = 'TTS_FAILED'; throw e; }
    if (spliceOn) await savePhonemeCache(coursesPath, phonemeCache);

    // segments por BLOCO (na ordem), somando a duracao dos seus chunks.
    const segments = blocks.map(() => ({ start: 0, end: 0, started: false }));
    let t = 0;
    segsFlat.forEach((seg, i) => {
      const s = segments[seg.blockIdx];
      if (!s.started) { s.start = +t.toFixed(3); s.started = true; }
      t += clips[i].dur;
      s.end = +t.toFixed(3);
    });
    // text = inicio do bloco -> o front casa o trecho com o elemento certo do DOM
    // por CONTEUDO (robusto a listas aninhadas/itens multi-linha que desalinhariam
    // um mapeamento por ordem).
    const cleanSegments = segments.map(({ start, end }, i) => ({ start, end, text: blocks[i].text.slice(0, 120) }));

    // Concatena na ordem -> mp3.
    const listPath = join(work, 'list.txt');
    await fs.writeFile(listPath, clips.map((c) => `file '${c.path}'`).join('\n'), 'utf8');
    const outName = `${lessonPrefix}_narracao_dub_01.mp3`;
    const tmpMp3 = join(work, outName);
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '4', tmpMp3]);

    let audioRel;
    if (isDrive) {
      const { getParentFolderId, uploadFileFromPath } = await import('../drive/index.js');
      const parentId = await getParentFolderId(ref);
      audioRel = await uploadFileFromPath(parentId, outName, tmpMp3, 'audio/mpeg');
    } else {
      const outAbs = join(dirname(ref), outName);
      await fs.copyFile(tmpMp3, outAbs);
      audioRel = relative(join(coursesPath, courseTitle), outAbs);
    }

    const payload = JSON.stringify({ audio: audioRel, segments: cleanSegments, voice: usedVoice, duration: +t.toFixed(2) });
    await query(
      `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
       VALUES ($1, $2, 'narracao', $3)
       ON CONFLICT (course_title, lesson_prefix, kind)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [courseTitle, lessonPrefix, payload],
    );

    return { ok: true, audio: audioRel, segments: cleanSegments, voice: usedVoice, blocks: blocks.length, duration: +t.toFixed(2), cost: 0 };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
};
