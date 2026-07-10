// Cache de fonemas (Kokoro /dev/phonemize) pra normalizacao de pronuncia por
// fonema splicing (ver narration.js). Diferente do .ocr-cache/.facts-cache
// (1 arquivo por video/aula), aqui as chaves sao trechos curtos de frase —
// caberiam MILHARES de entradas por curso, entao e 1 dicionario JSON so por
// curso (nao 1 arquivo por chave), carregado 1x e salvo no fim do lote.
// Local: <COURSES_PATH>/.tts-phoneme-cache.json

import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const CACHE_FILE = '.tts-phoneme-cache.json';
const cachePath = (coursesPath) => join(coursesPath || '.', CACHE_FILE);

const keyOf = (text, language) => createHash('sha1').update(`${language}::${text}`).digest('hex');

// Carrega o dicionario inteiro do curso (Map key->fonemas). Vazio se nao existe.
export const loadPhonemeCache = async (coursesPath) => {
  try {
    const raw = await fs.readFile(cachePath(coursesPath), 'utf8');
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
};

export const getPhoneme = (cache, text, language) => cache.get(keyOf(text, language));
export const setPhoneme = (cache, text, language, phonemes) => cache.set(keyOf(text, language), phonemes);

// Persiste o dicionario inteiro (best-effort — cache perdido so custa
// re-fonemizar, nunca corrompe a narracao).
export const savePhonemeCache = async (coursesPath, cache) => {
  try {
    await fs.writeFile(cachePath(coursesPath), JSON.stringify(Object.fromEntries(cache)), 'utf8');
  } catch { /* best-effort */ }
};
