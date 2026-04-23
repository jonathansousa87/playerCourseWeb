// Descoberta de cursos no disco + streaming de arquivos de midia + cache de
// duracao de videos + endpoint pra trocar o COURSES_PATH em runtime.

import express from 'express';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getCoursesPath, setCoursesPath } from '../config.js';

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
const LESSON_SUFFIXES = {
  video: /_dub\.(mp4|webm|ts|m3u8|mkv)$/i,
  resumo: /_resumo_dub_\d+(?:_ia)?\.md$/i,
  exemplos: /_exemplos_dub_\d+(?:_ia)?\.html$/i,
  quiz: /_quiz_dub_\d+(?:_ia)?\.html$/i,
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

const groupLessonFiles = (items) => {
  const groups = new Map();
  const ungrouped = [];

  for (const item of items) {
    if (item.type !== 'lesson') {
      ungrouped.push(item);
      continue;
    }
    const prefix = getLessonGroupPrefix(item.title);
    if (!prefix) {
      ungrouped.push(item);
      continue;
    }
    if (!groups.has(prefix)) groups.set(prefix, {});
    const materialType = getLessonMaterialType(item.title);
    if (materialType) {
      const existing = groups.get(prefix)[materialType];
      // Prioriza variante _ia quando houver ambos.
      if (!existing || (isIaVariant(item.title) && !isIaVariant(existing.title))) {
        groups.get(prefix)[materialType] = item;
      }
    }
  }

  const result = [...ungrouped];

  for (const [prefix, materials] of groups) {
    // Agrupa quando tem video (mesmo sem outros materiais) pra o botao
    // "Gerar IA" do stepper aparecer. Senao, solta.
    const hasVideo = !!materials.video;
    const materialCount = Object.keys(materials).length;
    if (materialCount === 1 && !hasVideo) {
      result.push(Object.values(materials)[0]);
      continue;
    }
    const cleanTitle = prefix.replace(/[-_]+$/, '').replace(/-/g, ' ');
    result.push({
      type: 'lesson-group',
      title: cleanTitle,
      prefix,
      path: materials.video?.path || Object.values(materials)[0].path,
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

// Serve arquivos de midia da pasta de cursos com suporte a range streaming.
router.get('/cursos/:file(*)', async (req, res) => {
  try {
    const filePath = join(getCoursesPath(), decodeFileName(req.params.file));
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = getContentType(filePath);

    if (contentType.startsWith('video/') && range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const stream = createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': contentType });
      createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Erro ao servir arquivo:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

router.get('/api/courses', async (_req, res) => {
  try {
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
          const coursePath = join(coursesPath, course.name);
          const content = await readCourseContent(coursePath);
          return {
            title: decodeFileName(course.name),
            description: `Curso de ${decodeFileName(course.name)}`,
            content,
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
