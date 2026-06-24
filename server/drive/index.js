import { google } from 'googleapis';

// Acesso total (read+write): a plataforma precisa gravar no Drive (curso de
// leitura, transcricoes do WhisperX e o mp3 do podcast). 'drive.file' nao serve
// porque so deixa mexer em arquivos que o proprio app criou — e gravamos dentro
// das pastas de curso ja existentes.
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const createOAuth2Client = () => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/drive/callback',
  );
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return client;
};

export const getAuth = () => createOAuth2Client();
export const getDrive = () => google.drive({ version: 'v3', auth: getAuth() });

export const isConfigured = () =>
  !!(process.env.GOOGLE_CLIENT_ID &&
     process.env.GOOGLE_CLIENT_SECRET &&
     process.env.GOOGLE_REFRESH_TOKEN);

// Cache em memoria (TTL 5min)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const withCache = async (key, fn) => {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  const data = await fn();
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
};

export const clearCache = () => {
  cache.clear();
  metaCache.clear();
};

// Lista subpastas diretas de um folder
export const listFolders = (parentId) =>
  withCache(`folders:${parentId}`, async () => {
    const { data } = await getDrive().files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
      orderBy: 'name',
    });
    return data.files || [];
  });

// Lista arquivos de uma pasta recursivamente (retorna arvore)
export const listFilesRecursive = (folderId, depth = 0) =>
  withCache(`tree:${folderId}`, async () => {
    if (depth > 6) return [];
    const { data } = await getDrive().files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size)',
      pageSize: 1000,
      orderBy: 'name',
    });
    const result = [];
    for (const item of data.files || []) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const children = await listFilesRecursive(item.id, depth + 1);
        result.push({ ...item, children });
      } else {
        result.push(item);
      }
    }
    return result;
  });

// Aplana a arvore de arquivos (sem pastas)
export const flattenFiles = (items) => {
  const out = [];
  for (const item of items) {
    if (item.children) out.push(...flattenFiles(item.children));
    else out.push(item);
  }
  return out;
};

// Baixa conteudo textual de um arquivo. Com retry/backoff: sob carga (varias
// aulas + materiais em paralelo) o Drive falha transitoriamente, e engolir esse
// erro fazia uma aula de leitura sumir ("transcricao vazia"). Re-tenta antes de propagar.
export const getFileContent = async (fileId) => {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 800 * i));
    try {
      const res = await getDrive().files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' },
      );
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
};

// Retorna Set de emails com acesso à pasta (type=user), ou null se for "anyone".
// Resultado cacheado — invalida junto com o restante ao chamar clearCache().
export const getSharedEmails = async (folderId) =>
  withCache(`perms:${folderId}`, async () => {
    const { data } = await getDrive().permissions.list({
      fileId: folderId,
      fields: 'permissions(emailAddress,type,role)',
    });
    const emails = new Set();
    for (const perm of data.permissions || []) {
      if (perm.type === 'anyone') return null; // publico — sem restricao
      if (perm.type === 'user' && perm.emailAddress) {
        emails.add(perm.emailAddress.toLowerCase());
      }
    }
    return emails; // Set vazio = ninguem alem do owner (improvavel mas seguro)
  });

// Cache de metadados (tamanho + mimeType) — necessario porque a googleapis
// nao expoe Content-Range/Content-Length nos response.headers ao usar stream.
const metaCache = new Map();
const getFileMeta = async (fileId) => {
  if (metaCache.has(fileId)) return metaCache.get(fileId);
  try {
    const { data } = await getDrive().files.get({
      fileId,
      fields: "size,mimeType",
    });
    const meta = {
      size: parseInt(data.size, 10),
      mimeType: data.mimeType || "video/mp4",
    };
    metaCache.set(fileId, meta);
    return meta;
  } catch (error) {
    console.error(`[Drive Meta Error] fileId: ${fileId}`, error.message);
    throw error;
  }
};

// Faz streaming de um arquivo do Drive para o Express response.
// Computa Content-Range/Content-Length manualmente a partir do Range do cliente
// + tamanho total do arquivo (cacheado), porque o Drive via googleapis nao
// expoe esses headers no response stream.
export const streamFile = async (fileId, rangeHeader, res) => {
  try {
    const { size: totalSize, mimeType } = await getFileMeta(fileId);

    console.log(`[Drive Stream] Info for ${fileId}:`, {
      mimeType,
      totalSize: (totalSize / (1024 * 1024)).toFixed(2) + " MB",
    });

    // Parse "bytes=START-END" ou "bytes=START-"
    let start = 0;
    let end = totalSize - 1;
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        start = parseInt(m[1], 10);
        if (m[2]) end = Math.min(parseInt(m[2], 10), totalSize - 1);
      }
    }
    const chunkSize = end - start + 1;

    console.log(`[Drive Stream] Starting stream for ${fileId}`, {
      range: rangeHeader,
      start,
      end,
      chunkSize,
    });

    const driveResp = await getDrive().files.get(
      { fileId, alt: "media", acknowledgeAbuse: true },
      { responseType: "stream", headers: { Range: `bytes=${start}-${end}` } }
    );

    // Verifica se o status eh de erro (googleapis retorna o stream mesmo pra erros se nao capturado)
    if (driveResp.status >= 400) {
      console.error(`[Drive Stream Error] Status ${driveResp.status} for ${fileId}`);
      return res.status(driveResp.status).json({ error: "Erro ao acessar arquivo no Google Drive" });
    }

    res.status(rangeHeader ? 206 : 200);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", chunkSize);
    if (rangeHeader) {
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    }

    driveResp.data.on("error", (err) => {
      console.error(`[Drive Stream Error] Pipe error for ${fileId}:`, err.message);
    });

    driveResp.data.pipe(res);
  } catch (error) {
    console.error(`[Drive Stream Error] Exception for ${fileId}:`, error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro interno ao processar stream do Google Drive" });
    }
  }
};

// Encontra o arquivo de transcricao de uma aula no Drive.
// Retorna { fileId, name } ou null.
export const findTranscriptInDrive = async (courseTitle, lessonPrefix) => {
  const { getDriveFolderId } = await import('../config.js');
  const folderId = getDriveFolderId();
  if (!folderId) throw new Error('DRIVE_COURSES_FOLDER_ID nao configurado');

  // Uma tentativa de busca (usa o cache de listagem).
  const attempt = async () => {
    const courseFolders = await listFolders(folderId);
    const courseFolder = courseFolders.find((f) => f.name === courseTitle);
    if (!courseFolder) return null;

    const allFiles = flattenFiles(await listFilesRecursive(courseFolder.id));
    const txt = allFiles.find(
      (f) =>
        f.name.startsWith(lessonPrefix) &&
        /_dub(?:\.[a-z]{2,3}(?:-[a-zA-Z]{2,4})?)?\.txt$/i.test(f.name) &&
        !/_(?:flashcards_anki|resumo|exemplos|quiz|diario_tecnico)_dub_\d+/i.test(f.name),
    );
    if (txt) return { fileId: txt.id, name: txt.name };
    const vtt = allFiles.find(
      (f) => f.name.startsWith(lessonPrefix) && /_dub(?:\.[a-z-]+)?\.vtt$/i.test(f.name),
    );
    return vtt ? { fileId: vtt.id, name: vtt.name } : null;
  };

  // Se nao achou, o cache de listagem pode estar desatualizado (curso/arquivo
  // recem-criado, ex.: curso de leitura). Limpa e tenta de novo antes de desistir.
  let result = await attempt();
  if (!result) {
    clearCache();
    result = await attempt();
  }
  return result;
};

// === Escrita no Drive ===

// Escapa um valor pra usar entre aspas simples numa query do Drive.
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// Acha um arquivo por nome exato dentro de uma pasta. Retorna {id,name} ou null.
export const findFileInFolder = async (parentId, name) => {
  const { data } = await getDrive().files.list({
    q: `name = ${q(name)} and '${parentId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  return data.files?.[0] || null;
};

// Garante uma subpasta (acha ou cria) e retorna o id.
export const ensureSubfolder = async (parentId, name) => {
  const drive = getDrive();
  const { data } = await drive.files.list({
    q: `name = ${q(name)} and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  if (data.files?.[0]) return data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  clearCache();
  return created.data.id;
};

// id da pasta-mae de um arquivo.
export const getParentFolderId = async (fileId) => {
  const { data } = await getDrive().files.get({ fileId, fields: 'parents' });
  return data.parents?.[0] || null;
};

// Retry/backoff p/ operacoes de escrita no Drive (falham transitoriamente sob carga).
const withRetry = async (fn, tries = 4) => {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 800 * i));
    try { return await fn(); } catch (e) { lastErr = e; }
  }
  throw lastErr;
};

// Sobe (cria ou atualiza) um arquivo de TEXTO numa pasta. Retorna o fileId.
export const uploadText = async (parentId, name, content, mimeType = 'text/plain') => {
  const drive = getDrive();
  const existing = await findFileInFolder(parentId, name);
  const id = await withRetry(async () => {
    if (existing) {
      await drive.files.update({ fileId: existing.id, media: { mimeType, body: content } });
      return existing.id;
    }
    const created = await drive.files.create({
      requestBody: { name, parents: [parentId] },
      media: { mimeType, body: content },
      fields: 'id',
    });
    return created.data.id;
  });
  clearCache();
  return id;
};

// Sobe (cria ou atualiza) um arquivo BINARIO a partir de um path local. Retorna o fileId.
// createReadStream e recriado a cada tentativa (stream nao pode ser reusado).
export const uploadFileFromPath = async (parentId, name, localPath, mimeType) => {
  const { createReadStream } = await import('fs');
  const drive = getDrive();
  const existing = await findFileInFolder(parentId, name);
  const id = await withRetry(async () => {
    if (existing) {
      await drive.files.update({ fileId: existing.id, media: { mimeType, body: createReadStream(localPath) } });
      return existing.id;
    }
    const created = await drive.files.create({
      requestBody: { name, parents: [parentId] },
      media: { mimeType, body: createReadStream(localPath) },
      fields: 'id',
    });
    return created.data.id;
  });
  clearCache();
  return id;
};

// Baixa um arquivo do Drive pra um path local (pra rodar WhisperX em audio do Drive).
export const downloadToFile = async (fileId, destPath) => {
  const { createWriteStream } = await import('fs');
  const res = await getDrive().files.get({ fileId, alt: 'media', acknowledgeAbuse: true }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    res.data.on('error', reject).pipe(createWriteStream(destPath)).on('finish', resolve).on('error', reject);
  });
  return destPath;
};

// Remove uma pasta (e tudo dentro) por id — usado pra re-rodar idempotente.
export const deleteFile = async (fileId) => {
  await getDrive().files.delete({ fileId });
  clearCache();
};

// Renomeia um arquivo/pasta por id.
export const renameFile = async (fileId, name) => {
  await getDrive().files.update({ fileId, requestBody: { name } });
  clearCache();
};

// Acha uma subpasta por nome exato dentro de um parent. Retorna {id,name} ou null.
export const findFolderByName = async (parentId, name) => {
  const { data } = await getDrive().files.list({
    q: `name = ${q(name)} and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  return data.files?.[0] || null;
};

export { SCOPES };
