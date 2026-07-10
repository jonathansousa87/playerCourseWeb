// Cache PERSISTENTE do "Canonical Lesson JSON" (etapa 1 do pipeline de leitura em 2
// etapas: extrair fatos -> redigir). Enderecado por CONTEUDO: hash de TUDO que decide
// a extracao (texto pre-condensado + nomes canonicos + contrato + instrucao + idioma).
// Objetivo: rodar a extracao (DeepSeek) UMA vez por aula e reaproveitar — reprocessar a
// redacao nao re-extrai. Se qualquer entrada mudar, o hash muda e re-extrai sozinho.
//
// Local: FACTS_CACHE_DIR (env) ou <coursesPath>/.facts-cache/<courseTitle>/. Uma
// subpasta por curso (courseTitle sanitizado) — permite limpar so o cache de UM curso
// (botao "limpar cache" no Gerar leitura) sem afetar os outros. Antes era uma pasta
// unica pra todo mundo (comentario dizia "reusavel entre cursos", intencional — mas
// na pratica cursos diferentes quase nunca tem transcricao byte-identica, entao o
// ganho teorico de reuso cross-curso nao compensava nao dar pra limpar por curso).
// Cache de antes desta mudanca fica orfao (nunca mais e' lido) — sem problema, e so
// recalculado sob demanda.

import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const safeCourseDir = (courseTitle) =>
  (courseTitle || '_sem-curso').replace(/[/\\?%*:|"<>]/g, '_');

const dirFor = (coursesPath, courseTitle) => {
  const base = (process.env.FACTS_CACHE_DIR || '').trim() || join(coursesPath || '.', '.facts-cache');
  return join(base, safeCourseDir(courseTitle));
};

// Bumpe FACTS_CACHE_VERSION quando MUDAR o prompt de extracao: as chaves mudam, o
// cache velho vira orfao e re-extrai preguiçosamente no proximo acesso.
const VERSION = (process.env.FACTS_CACHE_VERSION || '').trim();

// A chave cobre TODAS as entradas que alteram o JSON extraido.
const keyFor = ({ merged, canonicalNames = '', contract = '', instruction = '', sourceLanguage = 'pt' }) =>
  [VERSION, sourceLanguage, canonicalNames, contract, instruction, merged].join('\n\x00\n');

const fileFor = (dir, parts) =>
  join(dir, `${createHash('sha1').update(keyFor(parts)).digest('hex')}.json`);

export const getCachedFacts = async (coursesPath, courseTitle, parts) => {
  try { return await fs.readFile(fileFor(dirFor(coursesPath, courseTitle), parts), 'utf8'); } catch { return null; }
};

export const setCachedFacts = async (coursesPath, courseTitle, parts, json) => {
  try {
    const dir = dirFor(coursesPath, courseTitle);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fileFor(dir, parts), json, 'utf8');
  } catch { /* cache best-effort */ }
};

// Sem courseTitle: limpa a pasta INTEIRA (todos os cursos) — comportamento antigo,
// mantido pra quem ainda chama sem esse argumento.
export const clearFactsCache = async (coursesPath, courseTitle) => {
  try {
    const dir = courseTitle
      ? dirFor(coursesPath, courseTitle)
      : (process.env.FACTS_CACHE_DIR || '').trim() || join(coursesPath || '.', '.facts-cache');
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  } catch { return false; }
};
