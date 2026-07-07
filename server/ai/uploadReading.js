// Sobe um curso de LEITURA (gerado localmente, modo filesystem) para o Google
// Drive, recriando a estrutura de pastas. So aceita cursos "- Leitura". REGRA:
// o disco local e a fonte da verdade — reenviar ESPELHA exatamente o que existe
// localmente, apagando do Drive qualquer arquivo/pasta que nao exista mais aqui
// (ver SYNC no final). Sem isso, regenerar um modulo com agrupamento diferente
// (nomes/numeros de aula mudam) deixava aulas ANTIGAS penduradas no Drive com
// conteudo desatualizado, ao lado das novas.

import { promises as fs } from 'fs';
import { join } from 'path';
import { ensureSubfolder, uploadFileFromPath, deleteFile, listFilesRecursive } from '../drive/index.js';
import { getDriveFolderId } from '../config.js';
import { query } from '../../db/index.js';

const MIME = {
  txt: 'text/plain', md: 'text/markdown', mp3: 'audio/mpeg', wav: 'audio/wav',
  pdf: 'application/pdf', json: 'application/json', html: 'text/html',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', vtt: 'text/vtt',
};
const mimeFor = (name) => MIME[name.toLowerCase().split('.').pop()] || 'application/octet-stream';

export const uploadReadingCourseToDrive = async ({ coursesPath, courseTitle, onProgress = () => {} }) => {
  if (!/ - Leitura$/.test(courseTitle)) {
    const e = new Error('so cursos de leitura ("- Leitura") podem ser enviados'); e.code = 'NOT_READING'; throw e;
  }
  const rootId = getDriveFolderId();
  if (!rootId) { const e = new Error('DRIVE_COURSES_FOLDER_ID nao configurado'); e.code = 'NO_DRIVE'; throw e; }

  const localRoot = join(coursesPath, courseTitle);
  // coleta todos os arquivos (com o caminho relativo de pastas) p/ progresso.
  const files = [];
  const scan = async (dir, rel) => {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) await scan(join(dir, e.name), [...rel, e.name]);
      else files.push({ abs: join(dir, e.name), rel, name: e.name });
    }
  };
  await scan(localRoot, []);
  if (files.length === 0) { const e = new Error('pasta do curso de leitura vazia ou inexistente'); e.code = 'EMPTY'; throw e; }

  onProgress({ type: 'start', total: files.length });

  // pasta raiz do curso no Drive + cache de subpastas (cria 1x cada — guarda a
  // PROMISE, nao o resultado: com upload em paralelo, 2 arquivos do MESMO modulo
  // podiam cair aqui ao mesmo tempo e, se o cache so gravasse depois do await, os
  // dois viam "nao existe" e criavam pasta DUPLICADA. Guardando a promise na hora,
  // o segundo pega o mesmo "ensureSubfolder" em voo em vez de disparar outro.
  const courseFolderId = await ensureSubfolder(rootId, courseTitle);
  const folderCache = new Map([['', Promise.resolve(courseFolderId)]]);
  const ensurePath = async (relArr) => {
    let key = '';
    let parentPromise = folderCache.get('');
    for (const part of relArr) {
      const nk = key ? `${key}/${part}` : part;
      if (!folderCache.has(nk)) {
        folderCache.set(nk, parentPromise.then((parent) => ensureSubfolder(parent, part)));
      }
      parentPromise = folderCache.get(nk);
      key = nk;
    }
    return parentPromise;
  };

  // name (basename) -> fileId/relPath de cada arquivo enviado. narracao/podcast tem
  // nome DETERMINISTICO por aula (`${lessonPrefix}_narracao_dub_01.mp3` / `..._podcast_dub_01.mp3`),
  // entao reparamos o material de audio por NOME (ver fixAudioMaterials).
  const nameToFileId = new Map();
  const nameToRelPath = new Map();

  // Upload em PARALELO (o Drive nao faz mais lote/batch pra midia, mas aguenta bem
  // concorrencia — limite por usuario e bem folgado, ~12000 req/100s). Sequencial
  // era o gargalo real pra cursos com muitos arquivos pequenos (nao o tamanho em MB,
  // e a latencia de rede por chamada). mapPool = mesmo padrao ja usado em readingCourse.js.
  const UPLOAD_CONCURRENCY = Math.max(1, parseInt(process.env.DRIVE_UPLOAD_CONCURRENCY || '6', 10));
  let done = 0; let failed = 0; const errors = [];
  const mapPool = async (items, limit, fn) => {
    let next = 0;
    const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i]); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  };
  await mapPool(files, UPLOAD_CONCURRENCY, async (f) => {
    try {
      const parentId = await ensurePath(f.rel);
      // idempotente: uploadFileFromPath JA acha o arquivo de mesmo nome e faz
      // update EM CIMA dele (mesmo fileId) — NAO apagar antes. Apagar e recriar
      // trocava o fileId a cada reenvio, e o audio de narracao/podcast (uma vez
      // corrigido pra fileId por fixAudioMaterials) ficava com link morto no
      // segundo envio pra frente (o mp3 antigo, com o fileId gravado no banco,
      // era apagado e um novo — com outro fileId — tomava o lugar).
      const fileId = await uploadFileFromPath(parentId, f.name, f.abs, mimeFor(f.name));
      nameToFileId.set(f.name, fileId);
      nameToRelPath.set(f.name, [...f.rel, f.name].join('/'));
      done += 1;
      onProgress({ type: 'file', done, total: files.length, name: f.name });
    } catch (err) {
      failed += 1;
      errors.push(`${f.name}: ${err.message}`);
      onProgress({ type: 'file', done, total: files.length, name: f.name, error: err.message });
    }
  });

  // Materiais de audio (narracao/podcast): grava o fileId do Drive num campo
  // SEPARADO (content.driveAudio) e RECALCULA `audio` (path local) a partir da
  // varredura atual — nunca deriva um do outro. A rota /cursos/:file decide, na
  // hora de SERVIR, qual dos dois usar conforme o COURSE_SOURCE ativo NAQUELE
  // momento (ver server/routes/materials.js). Recalcular `audio` tambem AUTO-REPARA
  // um valor que ficou corrompido num upload anterior (versao antiga deste codigo
  // sobrescrevia `audio` direto com o fileId — quebrava a reproducao em modo
  // filesystem mesmo com o mp3 local intacto).
  await fixAudioMaterials({ courseTitle, nameToFileId, nameToRelPath });

  // SYNC — espelho completo: apaga do Drive TUDO (arquivo ou pasta) que nao exista
  // mais localmente. O laço acima so faz upsert (nome a nome) dos arquivos LOCAIS de
  // agora; sem essa varredura, uma geracao anterior com agrupamento diferente (nomes/
  // numeros de aula mudaram) deixava conteudo antigo pendurado no Drive — a leitura em
  // modo Drive escaneia TUDO que esta na pasta (sem manifesto), entao aula/material
  // orfao aparecia como se "nao tivesse sido sobrescrito". CAVEAT: narracao/podcast
  // gerados DIRETO em COURSE_SOURCE=drive (narration.js sobe o mp3 sem passar pelo
  // disco local) nunca aparecem na varredura local — se esse curso tiver audio gerado
  // assim num momento em que nao foi tambem gerado localmente, este sync o apaga.
  const localKeys = new Set(files.map((f) => [...f.rel, f.name].join('/')));
  let orphansRemoved = 0;
  // Sincroniza (bottom-up) uma subarvore do Drive: apaga arquivos sem correspondente
  // local, depois apaga a PROPRIA pasta se nao sobrar nada dentro (nem arquivo, nem
  // subpasta viva). Retorna true se a pasta sobreviveu (tem algo dentro).
  const syncFolder = async (folder, rel) => {
    let survivors = 0;
    for (const item of folder.children || []) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const kept = await syncFolder(item, [...rel, item.name]);
        if (kept) survivors += 1;
        else { try { await deleteFile(item.id); } catch { /* ignora */ } }
      } else {
        const key = [...rel, item.name].join('/');
        if (localKeys.has(key)) { survivors += 1; continue; }
        try { await deleteFile(item.id); orphansRemoved += 1; } catch { /* ignora */ }
      }
    }
    return survivors > 0;
  };
  try {
    const driveTree = await listFilesRecursive(courseFolderId);
    await syncFolder({ children: driveTree }, []);
  } catch { /* listagem falhou: nao bloqueia o upload, so pula a limpeza desta vez */ }

  onProgress({ type: 'done', done, failed, total: files.length, orphansRemoved });
  return { ok: failed === 0, done, failed, total: files.length, errors, orphansRemoved };
};

// nome DETERMINISTICO do mp3 por aula (identico ao gravado por narration.js/podcast.js).
const audioNameFor = (kind, lessonPrefix) => `${lessonPrefix}_${kind}_dub_01.mp3`;

const fixAudioMaterials = async ({ courseTitle, nameToFileId, nameToRelPath }) => {
  if (nameToFileId.size === 0) return;
  const { rows } = await query(
    `SELECT lesson_prefix, kind, content FROM lesson_materials
     WHERE course_title = $1 AND kind IN ('narracao', 'podcast')`,
    [courseTitle],
  );
  for (const row of rows) {
    let parsed;
    try { parsed = JSON.parse(row.content); } catch { continue; }
    const audioName = audioNameFor(row.kind, row.lesson_prefix);
    const fileId = nameToFileId.get(audioName);
    const relPath = nameToRelPath.get(audioName);
    if (!fileId) continue; // esse material nao tem mp3 local nesta geracao — nao mexe
    let changed = false;
    // driveAudio: campo SEPARADO pro modo drive, NUNCA deriva de/sobrescreve `audio`.
    if (fileId !== parsed.driveAudio) { parsed.driveAudio = fileId; changed = true; }
    // audio: RECALCULADO a partir da varredura local atual — auto-repara um valor
    // que uma versao antiga deste codigo tenha corrompido (sobrescrito com o fileId),
    // o que quebrava a reproducao em modo filesystem mesmo com o mp3 local intacto.
    if (relPath && relPath !== parsed.audio) { parsed.audio = relPath; changed = true; }
    if (!changed) continue;
    await query(
      `UPDATE lesson_materials SET content = $4, updated_at = NOW()
       WHERE course_title = $1 AND lesson_prefix = $2 AND kind = $3`,
      [courseTitle, row.lesson_prefix, row.kind, JSON.stringify(parsed)],
    );
  }
};
