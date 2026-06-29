// Cache PERSISTENTE da pre-condensacao do Qwen, enderecado por CONTEUDO (hash do
// texto da transcricao). Objetivo: rodar o Qwen UMA vez por transcricao e
// reaproveitar pra sempre — se voce reprocessar um modulo (so o DeepSeek), nao
// re-condensa no Qwen (nem precisa do servidor no ar). Se a transcricao mudar, o
// hash muda e ele re-condensa sozinho.
//
// Local: PRECONDENSE_CACHE_DIR (env) ou <coursesPath>/.precondense-cache. Como e
// content-addressed, e reusavel entre modulos/cursos e seguro de limpar.

import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const dirFor = (coursesPath) =>
  (process.env.PRECONDENSE_CACHE_DIR || '').trim() || join(coursesPath || '.', '.precondense-cache');

const fileFor = (dir, rawText) => join(dir, `${createHash('sha1').update(rawText).digest('hex')}.txt`);

export const getCachedPrecondense = async (coursesPath, rawText) => {
  try { return await fs.readFile(fileFor(dirFor(coursesPath), rawText), 'utf8'); } catch { return null; }
};

export const setCachedPrecondense = async (coursesPath, rawText, out) => {
  try {
    const dir = dirFor(coursesPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fileFor(dir, rawText), out, 'utf8');
  } catch { /* cache e best-effort: se falhar gravar, segue sem cachear */ }
};

// Limpa todo o cache (o usuario pode chamar quando quiser recomecar do zero).
export const clearPrecondenseCache = async (coursesPath) => {
  try { await fs.rm(dirFor(coursesPath), { recursive: true, force: true }); return true; } catch { return false; }
};
