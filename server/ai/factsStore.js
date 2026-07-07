// Cache PERSISTENTE do "Canonical Lesson JSON" (etapa 1 do pipeline de leitura em 2
// etapas: extrair fatos -> redigir). Enderecado por CONTEUDO: hash de TUDO que decide
// a extracao (texto pre-condensado + nomes canonicos + contrato + instrucao + idioma).
// Objetivo: rodar a extracao (DeepSeek) UMA vez por aula e reaproveitar — reprocessar a
// redacao nao re-extrai. Se qualquer entrada mudar, o hash muda e re-extrai sozinho.
//
// Local: FACTS_CACHE_DIR (env) ou <coursesPath>/.facts-cache. Content-addressed, logo
// reusavel entre modulos/cursos e seguro de limpar. Espelha o precondenseStore.

import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const dirFor = (coursesPath) =>
  (process.env.FACTS_CACHE_DIR || '').trim() || join(coursesPath || '.', '.facts-cache');

// Bumpe FACTS_CACHE_VERSION quando MUDAR o prompt de extracao: as chaves mudam, o
// cache velho vira orfao e re-extrai preguiçosamente no proximo acesso.
const VERSION = (process.env.FACTS_CACHE_VERSION || '').trim();

// A chave cobre TODAS as entradas que alteram o JSON extraido.
const keyFor = ({ merged, canonicalNames = '', contract = '', instruction = '', sourceLanguage = 'pt' }) =>
  [VERSION, sourceLanguage, canonicalNames, contract, instruction, merged].join('\n\x00\n');

const fileFor = (dir, parts) =>
  join(dir, `${createHash('sha1').update(keyFor(parts)).digest('hex')}.json`);

export const getCachedFacts = async (coursesPath, parts) => {
  try { return await fs.readFile(fileFor(dirFor(coursesPath), parts), 'utf8'); } catch { return null; }
};

export const setCachedFacts = async (coursesPath, parts, json) => {
  try {
    const dir = dirFor(coursesPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fileFor(dir, parts), json, 'utf8');
  } catch { /* cache best-effort */ }
};

export const clearFactsCache = async (coursesPath) => {
  try { await fs.rm(dirFor(coursesPath), { recursive: true, force: true }); return true; } catch { return false; }
};
