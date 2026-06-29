// Sobe um curso de LEITURA (gerado localmente, modo filesystem) para o Google
// Drive, recriando a estrutura de pastas. So aceita cursos "- Leitura". E
// idempotente: re-subir SUBSTITUI os arquivos (apaga o de mesmo nome antes).

import { promises as fs } from 'fs';
import { join } from 'path';
import { ensureSubfolder, uploadFileFromPath, findFileInFolder, deleteFile } from '../drive/index.js';
import { getDriveFolderId } from '../config.js';

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

  // pasta raiz do curso no Drive + cache de subpastas (cria 1x cada).
  const courseFolderId = await ensureSubfolder(rootId, courseTitle);
  const folderCache = new Map([['', courseFolderId]]);
  const ensurePath = async (relArr) => {
    let key = '';
    let parent = courseFolderId;
    for (const part of relArr) {
      const nk = key ? `${key}/${part}` : part;
      if (!folderCache.has(nk)) folderCache.set(nk, await ensureSubfolder(parent, part));
      parent = folderCache.get(nk);
      key = nk;
    }
    return parent;
  };

  let done = 0; let failed = 0; const errors = [];
  for (const f of files) {
    try {
      const parentId = await ensurePath(f.rel);
      // idempotente: substitui o arquivo de mesmo nome.
      const existing = await findFileInFolder(parentId, f.name);
      if (existing?.id) { try { await deleteFile(existing.id); } catch { /* ignora */ } }
      await uploadFileFromPath(parentId, f.name, f.abs, mimeFor(f.name));
      done += 1;
      onProgress({ type: 'file', done, total: files.length, name: f.name });
    } catch (err) {
      failed += 1;
      errors.push(`${f.name}: ${err.message}`);
      onProgress({ type: 'file', done, total: files.length, name: f.name, error: err.message });
    }
  }
  onProgress({ type: 'done', done, failed, total: files.length });
  return { ok: failed === 0, done, failed, total: files.length, errors };
};
