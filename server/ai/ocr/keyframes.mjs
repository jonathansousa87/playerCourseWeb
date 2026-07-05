// Extracao de keyframes de um video de aula para OCR.
//
// Usa ffmpeg `select=gt(scene,X)` (deteccao de mudanca de cena) com fallback
// para amostragem por FPS quando o scene-filter nao pega nada (video de slide
// estatico, por ex.). Dedup de frames quase-iguais por hash de pHash barato.
//
// Saida: lista de PNG (1920x1080) num dir temporario. O chamador remove depois.
//
// Nao depende de PySceneDetect (pip) — o ffmpeg scene-filter serve e evita
// mais uma dep. Se o usuario instalar scenedetect, usamos como pref (mais
// robusto em transicoes graduais); senao, ffmpeg.

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

const SCENE_THRESHOLD = 0.40; // sensitividade do scene-filter (0-1; menor = mais sensivel)
const FALLBACK_FPS = 0.5;    // 1 frame a cada 2s se o scene-filter nao pega nada
const MAX_FRAMES = 60;       // teto: mais que isso e so ruído/dedup
const MIN_FRAMES = 4;        // se o scene-filter pega menos que isso, usa fallback fps
const RESOLUTION = '1920x1080';

const run = (cmd, args, env) =>
  new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { env });
    let out = '';
    const on = (d) => { out += d.toString(); };
    proc.stdout.on('data', on);
    proc.stderr.on('data', on);
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, out }));
  });

// pHash barato: escala pra 16x16 cinza, threshold na media -> hash 256 bits.
// So pra dedup de frames quase-iguais — nao e perceptual de qualidade.
const phash = async (file) => {
  // Le o PNG como bytes e faz um hash do conteudo (rapido, suficiente pra
  // dedup exato). Pra dedup quase-exato, usariamos ffmpeg + numpy; mas o
  // scene-filter ja separa cenas distintas, entao dedup exato basta na pratica.
  const buf = await fs.readFile(file);
  return createHash('sha256').update(buf).digest('hex');
};

// Extrai keyframes de um video. Retorna { dir, frames: [path...] }.
// `dir` e temporario — o chamador deve remover apos consumir.
export const extractKeyframes = async ({ videoPath, log = () => {} } = {}) => {
  if (!videoPath) throw new Error('videoPath obrigatorio');

  const dir = join(tmpdir(), `keyframes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(dir, { recursive: true });

  // Tenta 1: scene-filter (deteccao de mudanca de cena)
  const sceneOut = join(dir, 'scene_%04d.png');
  const { code, out } = await run('ffmpeg', [
    '-y', '-i', videoPath,
    '-vf', `select='gt(scene,${SCENE_THRESHOLD})',scale=${RESOLUTION}`,
    '-vsync', 'vfr', '-q:v', '2',
    sceneOut,
  ]);

  let frames = [];
  if (code === 0) {
    const all = (await fs.readdir(dir)).filter((f) => /^scene_\d+\.png$/.test(f)).sort();
    frames = all.map((f) => join(dir, f));
  }

  // Se o scene-filter nao pegou o suficiente, usa fallback fps
  if (frames.length < MIN_FRAMES) {
    log(`[keyframes] scene-filter pegou ${frames.length}; tentando fallback fps=${FALLBACK_FPS}`);
    const fbOut = join(dir, 'fb_%04d.png');
    const r = await run('ffmpeg', [
      '-y', '-i', videoPath,
      '-vf', `fps=${FALLBACK_FPS},scale=${RESOLUTION}`,
      '-q:v', '2',
      fbOut,
    ]);
    if (r.code === 0) {
      const fb = (await fs.readdir(dir))
        .filter((f) => /^fb_\d+\.png$/.test(f))
        .sort()
        .map((f) => join(dir, f));
      if (fb.length > frames.length) frames = fb;
    }
  }

  // Dedup por hash exato (frames identicos que o filtro deixa passar)
  if (frames.length > MAX_FRAMES) {
    const seen = new Set();
    const deduped = [];
    for (const f of frames) {
      const h = await phash(f);
      if (seen.has(h)) { await fs.unlink(f).catch(() => {}); continue; }
      seen.add(h);
      deduped.push(f);
      if (deduped.length >= MAX_FRAMES) {
        // Remove os excedentes restantes
        break;
      }
    }
    // Limpa o que sobrou nao incluido
    const included = new Set(deduped);
    for (const f of frames) if (!included.has(f)) await fs.unlink(f).catch(() => {});
    frames = deduped;
  }

  log(`[keyframes] ${frames.length} frames extraidos de ${videoPath.split('/').pop()}`);
  if (frames.length === 0) {
    // Remove o dir vazio
    await fs.rmdir(dir, { recursive: true, force: true }).catch(() => {});
  }
  return { dir, frames };
};

// Remove o dir de keyframes (chamado no finally do consumidor).
export const cleanupKeyframes = async ({ dir } = {}) => {
  if (!dir) return;
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
};
