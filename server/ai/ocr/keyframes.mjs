// Extração de keyframes de um vídeo de aula para OCR.
//
// O3 — orquestração robusta:
// 1. PySceneDetect (preferencial, se instalado): detecta transições de cena
//    melhor que o scene-filter do ffmpeg (graduais, fades, cortes rápidos).
//    Fallback: ffmpeg `select=gt(scene,X)` + fps.
// 2. Dedup perceptual (pHash real): escala cada frame pra 16×16 cinza,
//    threshold na média → hash 256 bits. Frames com Hamming distance < N
//    são quase-iguais e só o primeiro fica. Muito melhor que hash exato.
// 3. Amostragem uniforme: se ainda sobram muitos frames após dedup, amostra
//    uniformemente ao longo do tempo (cobre o vídeo todo, não só o início).
//
// Saida: lista de PNG (1920×1080) num dir temporario. O chamador remove depois.

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir, cpus } from 'os';

// Concorrencia do pHash: cada frame vira 1 ffmpeg efemero (16x16 cinza). Rodar
// em serie serializava centenas de spawns e travava a CPU (o passo mais lento do
// OCR — o PaddleOCR em si e rapido na GPU). Paraleliza limitado aos nucleos.
const PHASH_CONCURRENCY = Math.max(2, Math.min(8, (cpus()?.length || 4)));
const mapPool = async (items, limit, fn) => {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

const SCENE_THRESHOLD = 0.40;   // sensitividade do scene-filter do ffmpeg
const FALLBACK_FPS = 0.5;      // 1 frame a cada 2s se scene-filter pega pouco
const MAX_FRAMES = 40;         // teto após dedup (40 frames é bom pra OCR)
const IFRAME_PRECAP = 80;      // teto de I-frames antes do pHash (limita o custo do dedup; o dedup+amostra refina pra MAX_FRAMES)
const MIN_FRAMES = 4;          // abaixo disso, usa fallback fps
const RESOLUTION = '1920x1080';
const PHASH_HAMMING_THRESHOLD = 6; // frames com distância Hamming < 6 são dedup (mais permissivo)
const PHASH_SIZE = 16;         // 16×16 = 256 bits

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

// Verifica se o PySceneDetect está disponível (pip install scenedetect).
const hasScenedetect = async () => {
  try {
    const { code } = await run('scenedetect', ['--version'], process.env);
    return code === 0;
  } catch {
    return false;
  }
};

// pHash perceptual real: usa ffmpeg pra escalar o frame pra 16×16 em YUV (cinza),
// extrai os pixels brutos, e calcula um hash binário (threshold na média).
// Retorna um array de 256 bits (0/1) — comparar com Hamming distance.
const phashPerceptual = async (file) => {
  try {
    const { code, out } = await run('ffmpeg', [
      '-i', file,
      '-vf', `scale=${PHASH_SIZE}:${PHASH_SIZE},format=gray`,
      '-f', 'rawvideo', '-pix_fmt', 'gray',
      'pipe:1',
    ], process.env);
    if (code !== 0) return null;
    // Pega os bytes crus (256 pixels = 256 bytes em gray)
    const buf = Buffer.from(out, 'binary');
    if (buf.length < PHASH_SIZE * PHASH_SIZE) return null;
    const pixels = buf.slice(0, PHASH_SIZE * PHASH_SIZE);
    // Média
    let sum = 0;
    for (let i = 0; i < pixels.length; i++) sum += pixels[i];
    const avg = sum / pixels.length;
    // Hash: 1 se pixel > média, 0 senão
    const hash = new Uint8Array(PHASH_SIZE * PHASH_SIZE);
    for (let i = 0; i < pixels.length; i++) hash[i] = pixels[i] > avg ? 1 : 0;
    return hash;
  } catch {
    return null;
  }
};

// Distância de Hamming entre dois pHashes (quantos bits diferem).
const hamming = (a, b) => {
  if (!a || !b || a.length !== b.length) return 999;
  let dist = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dist++;
  return dist;
};

// Dedup perceptual: remove frames quase-iguais (Hamming < threshold).
// Mantém o PRIMEIRO de cada cluster (representa a cena inicial).
// GARANTE um mínimo de MIN_FRAMES mesmo se tudo é parecido (cobre o vídeo todo).
// Depois amostra uniformemente se ainda > MAX_FRAMES.
const dedupAndSample = async (frames, log = () => {}) => {
  if (frames.length <= 1) return frames;

  // 1. Dedup perceptual: marca duplicatas (NÃO apaga ainda — podemos precisar
  // delas se o vídeo for tão estático que o dedup deixa < MIN_FRAMES).
  // Os pHashes (1 ffmpeg por frame) sao calculados EM PARALELO; a comparacao de
  // dedup segue SEQUENCIAL e identica (mantem o 1o de cada cluster, na ordem).
  const hashes = new Array(frames.length);
  await mapPool(frames, PHASH_CONCURRENCY, async (f, i) => { hashes[i] = await phashPerceptual(f); });

  const kept = [];
  const keptHashes = [];
  const isDup = new Array(frames.length).fill(false);
  for (let i = 0; i < frames.length; i++) {
    const h = hashes[i];
    let dup = false;
    for (const existing of keptHashes) {
      if (hamming(h, existing) < PHASH_HAMMING_THRESHOLD) { dup = true; break; }
    }
    if (dup) { isDup[i] = true; continue; }
    kept.push(frames[i]);
    keptHashes.push(h);
  }

  // 2. Se o dedup foi agressivo demais (vídeo com tela quase estática),
  // recupera frames dedupados espaçados uniformemente até MIN_FRAMES.
  const dedupCount = kept.length;
  if (kept.length < MIN_FRAMES) {
    const dupedFrames = frames.filter((_, i) => isDup[i]);
    const need = MIN_FRAMES - kept.length;
    if (dupedFrames.length >= need) {
      const step = dupedFrames.length / need;
      const recovered = [];
      for (let i = 0; i < need; i++) recovered.push(dupedFrames[Math.floor(i * step)]);
      kept.push(...recovered);
      const recoveredSet = new Set(recovered);
      for (let i = 0; i < frames.length; i++) {
        if (isDup[i] && recoveredSet.has(frames[i])) isDup[i] = false;
      }
    }
  }
  log(`[keyframes] dedup: ${frames.length} -> ${dedupCount}${dedupCount < MIN_FRAMES && kept.length > dedupCount ? ` -> ${kept.length} (recuperou estáticos)` : ''}`);

  // 3. Se ainda > MAX_FRAMES, amostra uniformemente ao longo do tempo
  if (kept.length > MAX_FRAMES) {
    const step = kept.length / MAX_FRAMES;
    const sampled = [];
    for (let i = 0; i < MAX_FRAMES; i++) sampled.push(kept[Math.floor(i * step)]);
    const sampledSet = new Set(sampled);
    // Marca os não-amostrados como dup (para apagar)
    for (let i = 0; i < frames.length; i++) {
      if (!sampledSet.has(frames[i])) isDup[i] = true;
      else isDup[i] = false;
    }
    log(`[keyframes] dedup: ${frames.length} -> amostra uniforme: ${sampled.length}`);
    kept.length = 0;
    kept.push(...sampled);
  }

  // 4. Apaga os marcados como dup
  for (let i = 0; i < frames.length; i++) {
    if (isDup[i]) await fs.unlink(frames[i]).catch(() => {});
  }

  return kept;
};

// Extração via PySceneDetect (mais robusto em transições graduais/fades).
// `scenedetect` CLI: detecta cenas e salva o primeiro frame de cada como PNG.
const extractViaScenedetect = async (videoPath, dir, log) => {
  const { code, out } = await run('scenedetect', [
    '-i', videoPath,
    '-o', dir,
    '-d', '0',  // detector: content (default)
    '-t', String(SCENE_THRESHOLD),
    'save-images',
    '-w', String(RESOLUTION.split('x')[0]),
    '-h', String(RESOLUTION.split('x')[1]),
    '-f', '%04d',
    '-n', '1',  // só 1 frame por cena (o primeiro)
  ], process.env);
  if (code !== 0) {
    log(`[keyframes] scenedetect falhou (exit ${code}); caindo pro ffmpeg`);
    return [];
  }
  const all = (await fs.readdir(dir))
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a); const nb = parseInt(b);
      return na - nb;
    })
    .map((f) => join(dir, f));
  return all;
};

// Extração via ffmpeg scene-filter + fallback fps.
const extractViaFfmpeg = async (videoPath, dir, log) => {
  // Tenta 1: scene-filter (detecção de mudança de cena)
  const sceneOut = join(dir, 'scene_%04d.png');
  const { code } = await run('ffmpeg', [
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

  // Se o scene-filter não pegou o suficiente, usa fallback fps
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
      // Limpa os scene_ que sobraram (poucos)
      for (const f of frames) await fs.unlink(f).catch(() => {});
      if (fb.length > frames.length) frames = fb;
    }
  }
  return frames;
};

// Extração RÁPIDA: decodifica SÓ os keyframes (I-frames) do vídeo — 1 frame por
// GOP em vez de todos os ~25fps. ~10x mais rápido que decodificar o vídeo inteiro
// (scene-filter/fps), e os I-frames já cobrem o vídeo ao longo do tempo (o encoder
// põe um a cada poucos segundos + nas trocas de cena). São intra-codificados
// (full-quality), ótimos pra OCR. Se o vídeo tiver I-frames de menos (GOP longo),
// o chamador cai pro scene-filter/fps.
const extractViaIframes = async (videoPath, dir) => {
  const out = join(dir, 'if_%04d.png');
  const { code } = await run('ffmpeg', [
    '-y', '-skip_frame', 'nokey', '-i', videoPath,
    '-vf', `scale=${RESOLUTION}`,
    '-vsync', 'vfr', '-q:v', '2',
    out,
  ]);
  if (code !== 0) return [];
  return (await fs.readdir(dir))
    .filter((f) => /^if_\d+\.png$/.test(f))
    .sort()
    .map((f) => join(dir, f));
};

// Reduz uniformemente uma lista de frames a `cap`, apagando os descartados.
// Usado pra limitar quantos I-frames vão pro pHash (o dedup depois refina).
const capUniform = async (frames, cap) => {
  if (frames.length <= cap) return frames;
  const step = frames.length / cap;
  const keep = new Set();
  const kept = [];
  for (let i = 0; i < cap; i++) { const f = frames[Math.floor(i * step)]; keep.add(f); kept.push(f); }
  for (const f of frames) if (!keep.has(f)) await fs.unlink(f).catch(() => {});
  return kept;
};

// Extrai keyframes de um video. Retorna { dir, frames: [path...] }.
// `dir` é temporário — o chamador deve remover após consumir.
export const extractKeyframes = async ({ videoPath, log = () => {} } = {}) => {
  if (!videoPath) throw new Error('videoPath obrigatorio');

  const dir = join(tmpdir(), `keyframes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(dir, { recursive: true });

  // 1. RAPIDO: só I-frames (decode ~10x menor). Cobre a maioria dos vídeos de
  //    aula (screencast/slide/código). Pré-limita a IFRAME_PRECAP pra baratear o
  //    pHash — o dedup perceptual + amostragem depois refinam pra MAX_FRAMES.
  let frames = await extractViaIframes(videoPath, dir);
  if (frames.length >= MIN_FRAMES) {
    frames = await capUniform(frames, IFRAME_PRECAP);
    log(`[keyframes] I-frames: ${frames.length} (decode rápido)`);
  } else {
    // 2. Poucos I-frames (GOP longo/atípico): cai pro decode completo.
    for (const f of frames) await fs.unlink(f).catch(() => {});
    if (await hasScenedetect()) {
      log('[keyframes] poucos I-frames; usando PySceneDetect');
      frames = await extractViaScenedetect(videoPath, dir, log);
      if (frames.length < MIN_FRAMES) {
        log('[keyframes] scenedetect pegou pouco; tentando ffmpeg');
        frames = await extractViaFfmpeg(videoPath, dir, log);
      }
    } else {
      log('[keyframes] poucos I-frames; usando ffmpeg scene-filter/fps');
      frames = await extractViaFfmpeg(videoPath, dir, log);
    }
  }

  if (!frames.length) {
    log(`[keyframes] sem frames extraídos de ${videoPath.split('/').pop()}`);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    return { dir, frames: [] };
  }

  // Dedup perceptual + amostragem uniforme
  frames = await dedupAndSample(frames, log);

  log(`[keyframes] ${frames.length} frames finais de ${videoPath.split('/').pop()}`);
  if (frames.length === 0) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  return { dir, frames };
};

// Remove o dir de keyframes (chamado no finally do consumidor).
export const cleanupKeyframes = async ({ dir } = {}) => {
  if (!dir) return;
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
};
