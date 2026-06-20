// Gera um podcast (~5 min) de uma aula: a DeepSeek roteiriza um dialogo entre
// dois personagens (um dev senior e uma entrevistadora); cada fala vira um clip
// de TTS no Kokoro (com a voz do personagem) e tudo e concatenado num .mp3 via
// ffmpeg. O audio fica no disco (servido por /cursos/) e o roteiro vai pro
// lesson_materials (kind='podcast') como JSON { audio, title, turns, names }.
//
// Roda SOMENTE em modo filesystem (escreve o mp3 em disco).

import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { join, dirname, relative } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { chatCompletion, DEFAULT_MODEL } from './deepseek.js';
import { loadTranscriptForLesson } from './generator.js';
import { PODCAST_SYSTEM, buildPodcastScriptPrompt } from './prompts.js';
import { ensureServer, synthesize } from './kokoro.js';
import { query } from '../../db/index.js';

// Vozes do Kokoro (podem ser blends com "+"). Defaults: blend PT-BR + espanhol
// (mesma estrategia do preset mais natural do DubAI: pf_dora+ef_dora).
const VOICE_SENIOR = () => (process.env.PODCAST_VOICE_SENIOR || 'pm_santa+bm_daniel+im_nicola').trim();
const VOICE_JUNIOR = () => (process.env.PODCAST_VOICE_JUNIOR || 'pf_dora+bf_lily+if_sara').trim();
const NAME_SENIOR = () => (process.env.PODCAST_NAME_SENIOR || 'Luiz').trim();
const NAME_JUNIOR = () => (process.env.PODCAST_NAME_JUNIOR || 'Daniela').trim();

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

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let errOut = '';
    proc.stderr.on('data', (d) => { errOut += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg falhou (${code}): ${errOut.slice(-300)}`)),
    );
  });

// Etapa 1 (DeepSeek): gera SO o roteiro. Rapido e e a unica parte que usa a API
// — fazendo isso primeiro liberamos a "fila" do DeepSeek pros outros materiais
// enquanto o Chatterbox (etapa 2) sintetiza o audio em paralelo.
export const generatePodcastScript = async ({
  coursesPath, courseTitle, lessonPrefix, model = DEFAULT_MODEL,
}) => {
  const { text: transcript, lessonTitle } = await loadTranscriptForLesson({
    courseTitle, lessonPrefix, coursesPath,
  });
  if (transcript.length < 50) {
    const e = new Error('transcricao vazia ou muito curta'); e.code = 'EMPTY_TRANSCRIPT'; throw e;
  }

  const { content, usage } = await chatCompletion({
    system: PODCAST_SYSTEM,
    user: buildPodcastScriptPrompt({
      lessonTitle, transcript, seniorName: NAME_SENIOR(), juniorName: NAME_JUNIOR(),
    }),
    model,
    temperature: 0.6,
    maxTokens: 6000,
    responseFormat: { type: 'json_object' },
  });
  const parsed = parseJsonLoose(content);
  const turns = (Array.isArray(parsed?.turns) ? parsed.turns : [])
    .map((t) => ({
      speaker: t.speaker === 'junior' ? 'junior' : 'senior',
      text: String(t.text || '').trim(),
    }))
    .filter((t) => t.text);
  if (turns.length < 4) {
    const e = new Error('roteiro do podcast invalido ou curto demais'); e.code = 'BAD_SCRIPT'; throw e;
  }
  const title = (parsed?.title || lessonTitle || 'Podcast da aula').toString().trim();
  return { title, turns, usage };
};

// Etapa 2 (Kokoro local): sintetiza o audio a partir de um roteiro pronto,
// concatena num mp3 na pasta da aula e registra no banco. Nao usa DeepSeek.
export const synthesizePodcast = async ({
  coursesPath, courseTitle, lessonPrefix, title, turns,
}) => {
  const clean = (Array.isArray(turns) ? turns : [])
    .map((t) => ({
      speaker: t.speaker === 'junior' ? 'junior' : 'senior',
      text: String(t.text || '').trim(),
    }))
    .filter((t) => t.text);
  if (clean.length < 4) {
    const e = new Error('roteiro do podcast invalido ou curto demais'); e.code = 'BAD_SCRIPT'; throw e;
  }
  const podcastTitle = (title || 'Podcast da aula').toString().trim();
  const voiceSenior = VOICE_SENIOR();
  const voiceJunior = VOICE_JUNIOR();
  const names = { senior: NAME_SENIOR(), junior: NAME_JUNIOR() };

  // Pasta da aula (a partir da transcricao) pra gravar o mp3.
  const { ref } = await loadTranscriptForLesson({ courseTitle, lessonPrefix, coursesPath });
  const lessonDir = dirname(ref);

  await ensureServer();

  const work = join(tmpdir(), `podcast-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  const clips = [];
  try {
    for (let i = 0; i < clean.length; i++) {
      const t = clean[i];
      const wav = await synthesize({ text: t.text, voice: t.speaker === 'junior' ? voiceJunior : voiceSenior });
      const clipPath = join(work, `clip_${String(i).padStart(3, '0')}.wav`);
      await fs.writeFile(clipPath, wav);
      clips.push(clipPath);
    }

    const listPath = join(work, 'list.txt');
    await fs.writeFile(listPath, clips.map((c) => `file '${c}'`).join('\n'), 'utf8');
    const outAbs = join(lessonDir, `${lessonPrefix}_podcast_dub_01.mp3`);
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '4', outAbs]);

    const audioRel = relative(join(coursesPath, courseTitle), outAbs);
    const payload = JSON.stringify({ audio: audioRel, title: podcastTitle, turns: clean, names });
    await query(
      `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
       VALUES ($1, $2, 'podcast', $3)
       ON CONFLICT (course_title, lesson_prefix, kind)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [courseTitle, lessonPrefix, payload],
    );

    return { ok: true, audio: audioRel, title: podcastTitle, turns: clean.length };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
};

// Atalho: roteiro + audio em um passo so (usado pelo endpoint atomico).
export const generatePodcastForLesson = async ({
  coursesPath, courseTitle, lessonPrefix, model = DEFAULT_MODEL,
}) => {
  const script = await generatePodcastScript({ coursesPath, courseTitle, lessonPrefix, model });
  const audio = await synthesizePodcast({
    coursesPath, courseTitle, lessonPrefix, title: script.title, turns: script.turns,
  });
  return { ...audio, usage: script.usage };
};
