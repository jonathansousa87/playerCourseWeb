// Cache de OCR por vídeo: vocabulário + diagramas extraídos de cada vídeo de aula.
// OCR roda 1× por vídeo e reusa. Local: <COURSES_PATH>/.ocr-cache/<hash>.json
//
// O hash é composto de (tamanho + mtime + nome do arquivo) — barato e suficiente
// (nao precisa ler o arquivo inteiro). Se o vídeo mudar (re-encode), roda de novo.

import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const CACHE_DIR = '.ocr-cache';

// Hash barato: nome + tamanho + mtime (nao le o arquivo).
const videoHash = async (videoPath) => {
  const stat = await fs.stat(videoPath).catch(() => null);
  if (!stat) return null;
  const h = createHash('sha1');
  h.update(`${videoPath}|${stat.size}|${stat.mtimeMs}`);
  return h.digest('hex').slice(0, 40);
};

const cacheDir = (coursesPath) => join(coursesPath || '.', CACHE_DIR);

// Lê o cache do vídeo. Retorna null se não existe.
export const getOcrCache = async (coursesPath, videoPath) => {
  const hash = await videoHash(videoPath);
  if (!hash) return null;
  const file = join(cacheDir(coursesPath), `${hash}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Grava o cache do vídeo. Estrutura: { vocabulary: [...], diagrams: [...],
// frames: N, at: ISO, hash }.
export const setOcrCache = async (coursesPath, videoPath, data) => {
  const hash = await videoHash(videoPath);
  if (!hash) return;
  const dir = cacheDir(coursesPath);
  await fs.mkdir(dir, { recursive: true });
  const file = join(dir, `${hash}.json`);
  await fs.writeFile(file, JSON.stringify({ ...data, hash, at: new Date().toISOString() }), 'utf8');
};

// Limpa todo o cache de OCR (para forçar reprocessamento).
export const clearOcrCache = async (coursesPath) => {
  const dir = cacheDir(coursesPath);
  try {
    const files = await fs.readdir(dir);
    let count = 0;
    for (const f of files) {
      await fs.unlink(join(dir, f)).catch(() => {});
      count++;
    }
    return count;
  } catch {
    return 0;
  }
};
