// Cache PERSISTENTE do FINGERPRINT do Qwen (qwenExtract), enderecado por CONTEUDO
// (hash do texto CRU da aula). Objetivo: extrair o fingerprint UMA vez por
// transcricao e reaproveitar pra sempre — reprocessar um modulo (so o DeepSeek/
// contrato F4) NAO re-extrai no Qwen (nem precisa do servidor no ar), entao o
// Qwen nem sobe num reprocesso puro. Se a transcricao mudar, o hash muda e ele
// re-extrai sozinho. Mesma ideia do precondenseStore.js.
//
// Local: FINGERPRINT_CACHE_DIR (env) ou <coursesPath>/.fingerprint-cache. Como e
// content-addressed, e reusavel entre modulos/cursos e seguro de limpar.

import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const dirFor = (coursesPath) =>
  (process.env.FINGERPRINT_CACHE_DIR || '').trim() || join(coursesPath || '.', '.fingerprint-cache');

// Versao do ESQUEMA do prompt de fingerprint. O output depende do system-prompt do
// qwenExtract; se ESSE prompt mudar, bumpe este numero (ou setar FINGERPRINT_CACHE_
// VERSION no env) pra invalidar o cache antigo e re-extrair preguicosamente.
const SCHEMA = '1';
const VERSION = (process.env.FINGERPRINT_CACHE_VERSION || '').trim();

const fileFor = (dir, rawText) => {
  const keyed = `s${SCHEMA}${VERSION ? `v${VERSION}` : ''}\n${rawText}`;
  return join(dir, `${createHash('sha1').update(keyed).digest('hex')}.txt`);
};

export const getCachedFingerprint = async (coursesPath, rawText) => {
  try { return await fs.readFile(fileFor(dirFor(coursesPath), rawText), 'utf8'); } catch { return null; }
};

export const setCachedFingerprint = async (coursesPath, rawText, out) => {
  try {
    const dir = dirFor(coursesPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fileFor(dir, rawText), out, 'utf8');
  } catch { /* cache e best-effort: se falhar gravar, segue sem cachear */ }
};

export const clearFingerprintCache = async (coursesPath) => {
  try { await fs.rm(dirFor(coursesPath), { recursive: true, force: true }); return true; } catch { return false; }
};
