// Cache PERSISTENTE do CONTRATO de curso (F4), enderecado por CONTEUDO. O
// contrato-prefixo de um modulo N depende de: instrucao (nicho), OCR canonico e
// os fingerprints dos modulos 01..N. Se nada disso mudou, reusa — nao re-chama o
// DeepSeek. Reprocessar o modulo N com os anteriores intactos = 0 custo de
// contrato. Se um modulo anterior mudar, a chave muda e re-sintetiza sozinho.
//
// Local: CONTRACT_CACHE_DIR (env) ou <coursesPath>/.contract-cache.

import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const dirFor = (coursesPath) =>
  (process.env.CONTRACT_CACHE_DIR || '').trim() || join(coursesPath || '.', '.contract-cache');

// Bumpe se MUDAR o prompt do buildContract (senao reusa contrato do esquema velho).
const SCHEMA = '1';
const VERSION = (process.env.CONTRACT_CACHE_VERSION || '').trim();

const fileFor = (dir, keyStr) =>
  join(dir, `${createHash('sha1').update(`s${SCHEMA}${VERSION ? `v${VERSION}` : ''}\n${keyStr}`).digest('hex')}.txt`);

export const getCachedContract = async (coursesPath, keyStr) => {
  try { return await fs.readFile(fileFor(dirFor(coursesPath), keyStr), 'utf8'); } catch { return null; }
};

export const setCachedContract = async (coursesPath, keyStr, text) => {
  try {
    const dir = dirFor(coursesPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fileFor(dir, keyStr), text, 'utf8');
  } catch { /* best-effort */ }
};

export const clearContractCache = async (coursesPath) => {
  try { await fs.rm(dirFor(coursesPath), { recursive: true, force: true }); return true; } catch { return false; }
};
