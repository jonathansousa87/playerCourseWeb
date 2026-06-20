// Cliente do Kokoro TTS (mesmo server que o DubAI usa) pra gerar os podcasts.
// API compativel-OpenAI: POST /v1/audio/speech {model, input, voice, lang_code,
// response_format, speed, ...} -> bytes do audio. Suporta BLENDING de vozes com
// "+" (ex.: "pm_santa+em_santa"). Roda em docker (kokoro-fastapi-gpu, porta 8880).
//
// .env:
//   KOKORO_URL        = http://127.0.0.1:8880
//   KOKORO_START_CMD  = docker start kokoro-container   (sobe sozinho se cair)

import { spawn } from 'child_process';

const url = () => (process.env.KOKORO_URL || 'http://127.0.0.1:8880').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const err = (code, message) => {
  const e = new Error(message);
  e.code = code;
  return e;
};

const reachable = async () => {
  try {
    const r = await fetch(`${url()}/v1/audio/voices`);
    return r.ok;
  } catch {
    return false;
  }
};

// Garante o Kokoro no ar. Se cair, tenta subir o container (configuravel) e
// espera responder. Em docker o boot + carga do modelo leva ~15-30s.
export const ensureServer = async () => {
  if (await reachable()) return;

  const startCmd = (process.env.KOKORO_START_CMD ?? 'docker start kokoro-container').trim();
  if (startCmd) {
    await new Promise((resolve) => {
      const p = spawn(startCmd, { shell: true, stdio: 'ignore' });
      p.on('close', resolve);
      p.on('error', resolve);
    });
  }

  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if (await reachable()) return;
  }
  throw err('NO_KOKORO', 'Kokoro nao respondeu em :8880 (suba o container kokoro ou ajuste KOKORO_URL/KOKORO_START_CMD)');
};

// Workarounds de pronuncia PT-BR (lang_code "p" + eSpeak), iguais ao DubAI:
// - "é"/"É" isolado vira "éé"/"Éé" (eSpeak senao le "e agudo");
// - interjeicoes sem vogal (hmm, mm, shh...) sao escritas foneticamente;
// - remove "né?" (cacoete repetitivo da fala/traducao).
const prepText = (t) =>
  String(t)
    .replace(/(?<=\s|^)é(?=\s|[.,!?]|$)/g, 'éé')
    .replace(/(?<=\s|^)É(?=\s|[.,!?]|$)/g, 'Éé')
    .replace(/\bhmm+\b/gi, 'Humm')
    .replace(/\bhm\b/gi, 'Hum')
    .replace(/\bmm-hmm+\b/gi, 'Hum-hum')
    .replace(/\bmm+\b/gi, 'Humm')
    .replace(/\bshh+\b/gi, 'Xii')
    .replace(/,?\s*né(?=\?)/g, '');

// Sintetiza uma fala. `voice` pode ser uma voz ("pf_dora") ou um blend
// ("pm_santa+em_santa"). lang_code "p" = portugues. Re-tenta em falha transitoria.
export const synthesize = async ({ text, voice, speed = 1.0, langCode = 'p' }) => {
  const body = {
    model: 'kokoro',
    input: prepText(text),
    voice,
    lang_code: langCode,
    response_format: 'wav',
    speed,
    stream: false,
    normalization_options: {
      normalize: true,
      unit_normalization: false,
      url_normalization: true,
      email_normalization: true,
      optional_pluralization_normalization: true,
    },
  };
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${url()}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        lastErr = new Error(`kokoro HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 256) {
        lastErr = new Error('kokoro retornou audio vazio');
        continue;
      }
      return buf;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || err('KOKORO_FAILED', 'kokoro falhou');
};
