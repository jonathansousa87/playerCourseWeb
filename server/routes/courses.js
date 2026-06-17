// Descoberta de cursos no disco + streaming de arquivos de midia + cache de
// duracao de videos + endpoint pra trocar o COURSES_PATH em runtime.

import express from 'express';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getCoursesPath, setCoursesPath, getCourseSource, getDriveFolderId } from '../config.js';
import { isTranscriptOfVideo } from '../transcriptDetect.js';
import { query } from '../../db/index.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Cache de duracao de videos mora na raiz do projeto (dois niveis acima deste arquivo).
const CACHE_PATH = join(__dirname, '..', '..', 'video-durations-cache.json');

// === Helpers de descoberta de arquivos de aula ===

const isLessonFile = (filename) => {
  const validExtensions = ['.mp4', '.webm', '.ts', '.m3u8', '.mkv', '.pdf', '.html', '.md', '.txt'];
  return validExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
};

const VIDEO_EXTENSIONS = /\.(mp4|webm|ts|m3u8|mkv)$/i;

const getContentType = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  const contentTypes = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    ts: 'video/mp2t',
    m3u8: 'application/x-mpegURL',
    mkv: 'video/x-matroska',
    pdf: 'application/pdf',
    html: 'text/html',
    md: 'text/markdown; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
  };
  return contentTypes[ext] || 'application/octet-stream';
};

// Sufixos que indicam arquivos complementares de uma aula (lesson group).
// _ia opcional identifica arquivos gerados por IA.
// quiz e exemplos aceitam .html (legado) e .md (novo padrao).
const LESSON_SUFFIXES = {
  video: /_dub\.(mp4|webm|ts|m3u8|mkv)$/i,
  resumo: /_resumo_dub_\d+(?:_ia)?\.md$/i,
  exemplos: /_exemplos_dub_\d+(?:_ia)?\.(?:html|md)$/i,
  quiz: /_quiz_dub_\d+(?:_ia)?\.(?:html|md)$/i,
  flashcards: /_flashcards_anki_dub_\d+(?:_ia)?\.txt$/i,
  diario: /_diario_tecnico_dub_\d+(?:_ia)?\.md$/i,
};

const isIaVariant = (filename) => /_ia\.[a-z0-9]+$/i.test(filename);

const getLessonGroupPrefix = (filename) => {
  for (const [, regex] of Object.entries(LESSON_SUFFIXES)) {
    const match = filename.match(regex);
    if (match) return filename.slice(0, match.index);
  }
  return null;
};

const getLessonMaterialType = (filename) => {
  for (const [type, regex] of Object.entries(LESSON_SUFFIXES)) {
    if (regex.test(filename)) return type;
  }
  return null;
};

// Transcricao "solta" (sem video irmao): _dub[.locale].(txt|vtt). Em cursos de
// leitura (so .txt), ela ancora um lesson-group pra o stepper + "Gerar IA"
// aparecerem e os materiais do banco se encaixarem. Em cursos normais a
// transcricao tem o mesmo prefixo do video, entao apenas se junta ao grupo dele.
const TRANSCRIPT_SUFFIX = /_dub(?:\.[a-z]{2,3}(?:-[a-zA-Z]{2,4})?)?\.(txt|vtt)$/i;
const getTranscriptPrefix = (filename) => {
  const match = filename.match(TRANSCRIPT_SUFFIX);
  return match ? filename.slice(0, match.index) : null;
};

const groupLessonFiles = (items) => {
  const groups = new Map();
  const ungrouped = [];

  for (const item of items) {
    if (item.type !== 'lesson') {
      ungrouped.push(item);
      continue;
    }
    const prefix = getLessonGroupPrefix(item.title);
    if (prefix) {
      if (!groups.has(prefix)) groups.set(prefix, {});
      const materialType = getLessonMaterialType(item.title);
      if (materialType) {
        const existing = groups.get(prefix)[materialType];
        // Prioriza variante _ia quando houver ambos.
        if (!existing || (isIaVariant(item.title) && !isIaVariant(existing.title))) {
          groups.get(prefix)[materialType] = item;
        }
      }
      continue;
    }
    // Transcricao solta: ancora o grupo (curso de leitura).
    const transcriptPrefix = getTranscriptPrefix(item.title);
    if (transcriptPrefix) {
      if (!groups.has(transcriptPrefix)) groups.set(transcriptPrefix, {});
      if (!groups.get(transcriptPrefix).__transcript) {
        groups.get(transcriptPrefix).__transcript = item;
      }
      continue;
    }
    ungrouped.push(item);
  }

  const result = [...ungrouped];

  for (const [prefix, group] of groups) {
    const transcript = group.__transcript;
    const materials = { ...group };
    delete materials.__transcript;

    // Agrupa quando tem video OU transcricao (mesmo sem outros materiais), pra
    // o botao "Gerar IA" aparecer e os materiais do banco se encaixarem.
    const hasVideo = !!materials.video;
    const materialCount = Object.keys(materials).length;
    if (materialCount === 1 && !hasVideo && !transcript) {
      result.push(Object.values(materials)[0]);
      continue;
    }
    const anchorPath =
      materials.video?.path || transcript?.path || Object.values(materials)[0]?.path;
    const cleanTitle = prefix.replace(/[-_]+$/, '').replace(/-/g, ' ');
    result.push({
      type: 'lesson-group',
      title: cleanTitle,
      prefix,
      path: anchorPath,
      materials,
    });
  }

  const extractNumber = (title) => {
    const match = title.match(/^(\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  return result.sort((a, b) => {
    const numA = extractNumber(a.title);
    const numB = extractNumber(b.title);
    if (numA !== numB) return numA - numB;
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
  });
};

const decodeFileName = (fileName) => {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
};

// Leitura recursiva da pasta do curso.
async function readCourseContent(path, basePath = '') {
  try {
    const items = await fs.readdir(path, { withFileTypes: true });

    // Pre-passa: coleta basenames dos videos da pasta. Usado pra filtrar
    // .txt/.vtt que sao transcricoes (mesmo nome do video) de aulas .txt
    // de verdade.
    const videoBasenames = new Set();
    for (const item of items) {
      if (!item.isDirectory() && VIDEO_EXTENSIONS.test(item.name)) {
        videoBasenames.add(item.name.replace(VIDEO_EXTENSIONS, ''));
      }
    }

    const content = [];
    for (const item of items) {
      const fullPath = join(path, item.name);
      const relativePath = basePath ? join(basePath, item.name) : item.name;
      if (item.isDirectory()) {
        const subContent = await readCourseContent(fullPath, relativePath);
        if (subContent.length > 0) {
          content.push({
            type: 'module',
            title: decodeFileName(item.name),
            path: relativePath,
            content: subContent,
          });
        }
      } else if (isLessonFile(item.name)) {
        // Ignora transcricoes (txt/vtt com mesmo basename do video).
        // Outros .txt (com nome diferente) seguem como aulas.
        if (isTranscriptOfVideo(item.name, videoBasenames)) continue;
        content.push({
          type: 'lesson',
          title: decodeFileName(item.name),
          path: relativePath,
        });
      }
    }
    return groupLessonFiles(content);
  } catch (error) {
    console.error('Erro ao ler conteudo:', path, error);
    return [];
  }
}

// === Rotas ===

// Serve arquivos de midia. Em modo Drive o parametro :file e o fileId do Drive.
router.get('/cursos/:file(*)', async (req, res) => {
  const rawPath = decodeFileName(req.params.file);
  try {
    if (getCourseSource() === 'drive') {
      const { streamFile, getSharedEmails } = await import('../drive/index.js');
      // Em modo Drive o fileId vem como ultimo segmento do path
      // (o front envia cursos/{courseTitle}/{fileId} mas so o fileId importa).
      const fileId = rawPath.split('/').pop();

      const folderId = getDriveFolderId();
      if (folderId) {
        const allowed = await getSharedEmails(folderId);
        if (allowed !== null) {
          const userEmail = req.userEmail?.toLowerCase();
          if (!userEmail || !allowed.has(userEmail)) {
            console.warn(`[Auth] Acesso negado ao arquivo ${fileId} para o usuario ${userEmail}`);
            return res.status(403).json({ error: 'Sem permissao para acessar este conteudo. Solicite acesso ao administrador.' });
          }
        }
      }

      await streamFile(fileId, req.headers.range, res);
      return;
    }
    const filePath = join(getCoursesPath(), rawPath);
    try {
      const stat = await fs.stat(filePath);
      const contentType = getContentType(filePath);

      // Para arquivos locais, res.sendFile eh o metodo mais compativel com o Chrome
      // pois gerencia Ranges e ETag de forma nativa e otimizada.
      res.sendFile(filePath, {
        acceptRanges: true,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        }
      });
    } catch (error) {
      console.error('Erro ao servir arquivo:', error);
      res.status(500).send('Erro interno do servidor');
    }
  } catch (error) {
    console.error('Erro ao servir arquivo:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Converte a arvore do Drive no mesmo formato de readCourseContent.
// Em modo Drive o path de cada lesson e o fileId do arquivo no Drive.
const buildDriveContent = (driveItems) => {
  const items = [];
  for (const item of driveItems) {
    if (item.children !== undefined) {
      const sub = buildDriveContent(item.children);
      if (sub.length > 0) {
        items.push({ type: 'module', title: item.name, path: item.id, content: sub });
      }
    } else if (VIDEO_EXTENSIONS.test(item.name)) {
      // So videos disparam agrupamento; materiais vem do banco via augmentWithDbMaterials
      items.push({ type: 'lesson', title: item.name, path: item.id });
    } else if (TRANSCRIPT_SUFFIX.test(item.name)) {
      // Transcricao solta (curso de leitura): ancora um grupo mesmo sem video.
      // Em curso normal ela tem o mesmo prefixo do video e so se junta ao grupo.
      items.push({ type: 'lesson', title: item.name, path: item.id });
    }
  }
  return groupLessonFiles(items);
};

// Mescla materiais armazenados no banco (lesson_materials + flashcard_decks)
// na arvore de conteudo retornada pelo filesystem.
const augmentWithDbMaterials = (content, dbMaterials, dbFlashcards) => {
  return content.map((item) => {
    if (item.type === 'module') {
      return { ...item, content: augmentWithDbMaterials(item.content, dbMaterials, dbFlashcards) };
    }
    if (item.type === 'lesson-group') {
      const extra = {};
      for (const kind of (dbMaterials[item.prefix] || [])) {
        if (!item.materials[kind]) {
          extra[kind] = { path: '__db__', kind, title: kind };
        }
      }
      if (dbFlashcards.has(item.prefix) && !item.materials.flashcards) {
        extra.flashcards = { path: '__db__', kind: 'flashcards', title: 'flashcards' };
      }
      if (Object.keys(extra).length === 0) return item;
      return { ...item, materials: { ...item.materials, ...extra } };
    }
    return item;
  });
};

router.get('/api/courses', async (req, res) => {
  const _req = req;
  try {
    // ── Modo Drive ──────────────────────────────────────────────────────────
    if (getCourseSource() === 'drive') {
      const folderId = getDriveFolderId();
      if (!folderId) {
        return res.status(503).json({ error: 'DRIVE_COURSES_FOLDER_ID nao configurado no .env' });
      }
      const { listFolders, listFilesRecursive, getSharedEmails } = await import('../drive/index.js');

      // Verifica acesso antes de listar cursos
      const allowed = await getSharedEmails(folderId).catch(() => null);
      if (allowed !== null) {
        const userEmail = _req.userEmail?.toLowerCase();
        if (!userEmail || !allowed.has(userEmail)) {
          return res.json([]); // retorna lista vazia — sem expor mensagem de erro
        }
      }
      const folders = await listFolders(folderId);
      const courseData = await Promise.all(
        folders.map(async (folder) => {
          const courseTitle = folder.name;
          const tree = await listFilesRecursive(folder.id);
          const content = buildDriveContent(tree);
          let dbMaterials = {}, dbFlashcards = new Set();
          try {
            const [matRows, deckRows] = await Promise.all([
              query('SELECT lesson_prefix, kind FROM lesson_materials WHERE course_title = $1', [courseTitle]),
              query('SELECT DISTINCT lesson_prefix FROM flashcard_decks WHERE course_title = $1', [courseTitle]),
            ]);
            for (const { lesson_prefix, kind } of matRows.rows) {
              if (!dbMaterials[lesson_prefix]) dbMaterials[lesson_prefix] = [];
              dbMaterials[lesson_prefix].push(kind);
            }
            dbFlashcards = new Set(deckRows.rows.map((r) => r.lesson_prefix));
          } catch { /* continua sem materiais do banco */ }
          return {
            title: courseTitle,
            description: `Curso de ${courseTitle}`,
            content: augmentWithDbMaterials(content, dbMaterials, dbFlashcards),
          };
        }),
      );
      return res.json(courseData);
    }

    // ── Modo Filesystem (padrao) ─────────────────────────────────────────────
    const coursesPath = getCoursesPath();
    try {
      await fs.access(coursesPath);
    } catch {
      return res.status(404).json({ error: 'Diretorio de cursos nao encontrado' });
    }

    const courses = await fs.readdir(coursesPath, { withFileTypes: true });
    const courseData = await Promise.all(
      courses
        .filter((c) => c.isDirectory())
        .map(async (course) => {
          const courseTitle = decodeFileName(course.name);
          const coursePath = join(coursesPath, course.name);
          const content = await readCourseContent(coursePath);

          // Busca materiais e decks no banco para este curso
          let dbMaterials = {};
          let dbFlashcards = new Set();
          try {
            const [matRows, deckRows] = await Promise.all([
              query(
                'SELECT lesson_prefix, kind FROM lesson_materials WHERE course_title = $1',
                [courseTitle],
              ),
              query(
                'SELECT DISTINCT lesson_prefix FROM flashcard_decks WHERE course_title = $1',
                [courseTitle],
              ),
            ]);
            for (const { lesson_prefix, kind } of matRows.rows) {
              if (!dbMaterials[lesson_prefix]) dbMaterials[lesson_prefix] = [];
              dbMaterials[lesson_prefix].push(kind);
            }
            dbFlashcards = new Set(deckRows.rows.map((r) => r.lesson_prefix));
          } catch {
            // Se o banco falhar, continua com filesystem apenas
          }

          return {
            title: courseTitle,
            description: `Curso de ${courseTitle}`,
            content: augmentWithDbMaterials(content, dbMaterials, dbFlashcards),
          };
        }),
    );
    res.json(courseData);
  } catch (error) {
    console.error('Erro ao ler cursos:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/video-durations', async (_req, res) => {
  try {
    const cacheData = await fs.readFile(CACHE_PATH, 'utf8');
    res.json(JSON.parse(cacheData));
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({});
    } else {
      console.error('Erro ao carregar cache de duracoes:', error);
      res.status(500).json({ error: 'Erro ao carregar cache' });
    }
  }
});

router.post('/api/video-durations', async (req, res) => {
  try {
    const durations = req.body;
    await fs.writeFile(CACHE_PATH, JSON.stringify(durations, null, 2));
    res.json({ success: true, count: Object.keys(durations).length });
  } catch (error) {
    console.error('Erro ao salvar cache de duracoes:', error);
    res.status(500).json({ error: 'Erro ao salvar cache' });
  }
});

router.put('/api/video-durations/:videoPath(*)', async (req, res) => {
  try {
    const videoPath = decodeURIComponent(req.params.videoPath);
    const { duration } = req.body;
    let durations = {};
    try {
      durations = JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
    } catch {
      // arquivo nao existe - comeca do zero
    }
    durations[videoPath] = duration;
    await fs.writeFile(CACHE_PATH, JSON.stringify(durations, null, 2));
    res.json({ success: true, videoPath, duration });
  } catch (error) {
    console.error('Erro ao atualizar duracao:', error);
    res.status(500).json({ error: 'Erro ao atualizar duracao' });
  }
});

router.post('/api/config/courses-path', async (req, res) => {
  try {
    const { path } = req.body;
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'Caminho invalido' });
    }
    try {
      await fs.access(path);
      const newPath = setCoursesPath(path);
      res.json({ success: true, path: newPath });
    } catch {
      res.status(404).json({ error: 'Caminho nao encontrado' });
    }
  } catch (error) {
    console.error('Erro ao configurar caminho dos cursos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/api/config/courses-path', (_req, res) => {
  res.json({ path: getCoursesPath() });
});

export default router;
