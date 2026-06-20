// Cliente do Chatterbox (TTS com clonagem de voz) usado pra gerar os podcasts.
// Mesmo server/contrato do DuBlay (~/Documentos/projetos/DuBlay): FastAPI na
// porta 8889, POST /clone {text, ref_audio, language, cfg_weight, exaggeration}
// -> bytes WAV. A plataforma SOBE o server sozinha (env conda) quando precisa.
//
// .env (todos com default apontando pro DuBlay):
//   CHATTERBOX_URL        = http://127.0.0.1:8889
//   CHATTERBOX_PYTHON     = ~/miniconda3/envs/chatterbox/bin/python
//   CHATTERBOX_SERVER     = .../DuBlay/chatterbox_server/server.py
//   CHATTERBOX_REFS_DIR   = .../DuBlay/backend/refs
//   PODCAST_VOICE_SENIOR  = Guilherme
//   PODCAST_VOICE_JUNIOR  = Sakura

import { spawn } from 'child_process';
import { existsSync, readdirSync, statSync, openSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const DEFAULT_DUBLAY = '/home/kadabra/Documentos/projetos/DuBlay';

const url = () => (process.env.CHATTERBOX_URL || 'http://127.0.0.1:8889').replace(/\/$/, '');
const refsDir = () => process.env.CHATTERBOX_REFS_DIR || join(DEFAULT_DUBLAY, 'backend/refs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const err = (code, message) => {
  const e = new Error(message);
  e.code = code;
  return e;
};

const health = async () => {
  try {
    const r = await fetch(`${url()}/health`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

// Garante o server no ar. Se nao responder, sobe via conda e espera o /health
// virar "ready" (modelo carrega + aquece em ~15s; damos folga ate 120s).
export const ensureServer = async () => {
  const h = await health();
  if (h?.status === 'ready') return;

  // So tenta subir se nao houver NINGUEM respondendo (evita duplicar processo).
  if (h === null) {
    const py = process.env.CHATTERBOX_PYTHON || join(homedir(), 'miniconda3/envs/chatterbox/bin/python');
    const server = process.env.CHATTERBOX_SERVER || join(DEFAULT_DUBLAY, 'chatterbox_server/server.py');
    if (!existsSync(py)) throw err('NO_CHATTERBOX', `Python do Chatterbox nao encontrado: ${py} (configure CHATTERBOX_PYTHON)`);
    if (!existsSync(server)) throw err('NO_CHATTERBOX', `server.py do Chatterbox nao encontrado: ${server} (configure CHATTERBOX_SERVER)`);
    const log = openSync('/tmp/playercourse-chatterbox.log', 'a');
    const proc = spawn(py, [server], {
      cwd: dirname(server),
      stdio: ['ignore', log, log],
      detached: true,
    });
    proc.unref();
  }

  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    const hh = await health();
    if (hh?.status === 'ready') return;
  }
  throw err('CHATTERBOX_TIMEOUT', 'Chatterbox nao ficou pronto a tempo (veja /tmp/playercourse-chatterbox.log)');
};

// Resolve o nome de uma voz pro arquivo de referencia. Prefere o WAV limpo do
// .wav_cache (24kHz), com fallback pro arquivo cru (mp3, ou sem extensao).
export const resolveVoice = (name) => {
  for (const g of ['male', 'female']) {
    const w = join(refsDir(), g, '.wav_cache', `${name}.wav`);
    if (existsSync(w)) return w;
  }
  for (const g of ['male', 'female']) {
    const d = join(refsDir(), g);
    try {
      for (const f of readdirSync(d)) {
        const stem = f.replace(/\.[^.]+$/, '');
        const full = join(d, f);
        if (stem === name && !statSync(full).isDirectory()) return full;
      }
    } catch { /* pasta de genero ausente */ }
  }
  return null;
};

// Gera o WAV de uma fala. Chatterbox falha intermitente (gera vazio) — re-tenta.
export const clone = async ({ text, refAudio, cfgWeight = 0.5, exaggeration = 0.5, language = 'pt' }) => {
  const payload = { text, ref_audio: refAudio, language, cfg_weight: cfgWeight, exaggeration };
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${url()}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        lastErr = new Error(`clone HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1024) {
        lastErr = new Error('clone retornou audio vazio');
        continue;
      }
      return buf;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || err('CHATTERBOX_FAILED', 'clone falhou');
};
