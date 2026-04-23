import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import cors from 'cors';
import { createReadStream } from 'fs';
import { query, ensureReady } from './db/index.js';
import {
  importDeck,
  getDeck,
  getDueCards,
  reviewCard,
  getDueSummary,
} from './server/flashcards.js';
import { generateForLesson } from './server/ai/generator.js';
import { DEFAULT_MODEL as DEEPSEEK_DEFAULT_MODEL } from './server/ai/deepseek.js';
import { findConfusionGroups } from './server/semanticConfusion.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Caminho absoluto para a pasta de cursos (configurável)
let COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';

const app = express();
app.use(cors());
app.use(express.json());

// Middleware para permitir streaming de vídeo
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Range');
  res.header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length');
  next();
});

// Função auxiliar para verificar se é um arquivo de aula válido
const isLessonFile = (filename) => {
  const validExtensions = ['.mp4', '.webm', '.ts', '.m3u8', '.mkv', '.pdf', '.html', '.md', '.txt'];
  return validExtensions.some(ext => filename.toLowerCase().endsWith(ext));
};

// Função para obter o content-type baseado na extensão
const getContentType = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  const contentTypes = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ts': 'video/mp2t',
    'm3u8': 'application/x-mpegURL',
    'mkv': 'video/x-matroska',
    'pdf': 'application/pdf',
    'html': 'text/html',
    'md': 'text/markdown; charset=utf-8',
    'txt': 'text/plain; charset=utf-8'
  };
  return contentTypes[ext] || 'application/octet-stream';
};

// Sufixos que indicam arquivos complementares de uma aula (lesson group).
// _ia opcional identifica arquivos gerados por IA (ganham prioridade no agrupamento).
const LESSON_SUFFIXES = {
  video: /_dub\.(mp4|webm|ts|m3u8|mkv)$/i,
  resumo: /_resumo_dub_\d+(?:_ia)?\.md$/i,
  exemplos: /_exemplos_dub_\d+(?:_ia)?\.html$/i,
  quiz: /_quiz_dub_\d+(?:_ia)?\.html$/i,
  flashcards: /_flashcards_anki_dub_\d+(?:_ia)?\.txt$/i,
  diario: /_diario_tecnico_dub_\d+(?:_ia)?\.md$/i,
};

const isIaVariant = (filename) => /_ia\.[a-z0-9]+$/i.test(filename);

// Extrai o prefixo base de um arquivo de aula agrupada
const getLessonGroupPrefix = (filename) => {
  // Tenta casar com qualquer sufixo conhecido
  for (const [, regex] of Object.entries(LESSON_SUFFIXES)) {
    const match = filename.match(regex);
    if (match) {
      return filename.slice(0, match.index);
    }
  }
  return null;
};

// Identifica o tipo de material complementar
const getLessonMaterialType = (filename) => {
  for (const [type, regex] of Object.entries(LESSON_SUFFIXES)) {
    if (regex.test(filename)) return type;
  }
  return null;
};

// Agrupa arquivos soltos em lesson groups quando possuem materiais complementares
const groupLessonFiles = (items) => {
  const groups = new Map(); // prefix -> { type -> item }
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

    if (!groups.has(prefix)) {
      groups.set(prefix, {});
    }
    const materialType = getLessonMaterialType(item.title);
    if (materialType) {
      const existing = groups.get(prefix)[materialType];
      // Prioriza variante _ia quando ha ambos.
      if (!existing || (isIaVariant(item.title) && !isIaVariant(existing.title))) {
        groups.get(prefix)[materialType] = item;
      }
    }
  }

  const result = [...ungrouped];

  for (const [prefix, materials] of groups) {
    // Agrupa sempre que houver video (mesmo sem outros materiais) pra expor o botao
    // "Gerar IA" do stepper. Se nao tem video nem outros materiais pra acompanhar, solta.
    const hasVideo = !!materials.video;
    const materialCount = Object.keys(materials).length;
    if (materialCount === 1 && !hasVideo) {
      result.push(Object.values(materials)[0]);
      continue;
    }

    // Cria um lesson group
    const cleanTitle = prefix
      .replace(/[-_]+$/, '')
      .replace(/-/g, ' ')
      .replace(/^\d+\.\s*/, (m) => m); // preserva numeração

    result.push({
      type: 'lesson-group',
      title: cleanTitle,
      prefix: prefix,
      path: materials.video?.path || Object.values(materials)[0].path,
      materials: materials,
    });
  }

  // Ordenar pelo número no início do título
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

// Função para decodificar nomes de arquivos com caracteres especiais
const decodeFileName = (fileName) => {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
};

// Função recursiva para ler o conteúdo das pastas
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
            content: subContent
          });
        }
      } else if (isLessonFile(item.name)) {
        content.push({
          type: 'lesson',
          title: decodeFileName(item.name),
          path: relativePath
        });
      }
    }

    // Agrupar arquivos complementares em lesson groups
    const grouped = groupLessonFiles(content);
    return grouped;
  } catch (error) {
    console.error('Erro ao ler conteúdo:', path, error);
    return [];
  }
}

// Rota para servir vídeos e arquivos com suporte a streaming
app.get('/cursos/:file(*)', async (req, res) => {
  try {
    const filePath = join(COURSES_PATH, decodeFileName(req.params.file));
    console.log('Tentando acessar arquivo:', filePath);

    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = getContentType(filePath);

    // Se for vídeo e tiver range header, usa streaming
    if (contentType.startsWith('video/') && range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const stream = createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });

      stream.pipe(res);
    } else {
      // Para outros tipos de arquivo, envia normalmente
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Erro ao servir arquivo:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Rota para listar os cursos
app.get('/api/courses', async (req, res) => {
  try {
    console.log('Buscando cursos em:', COURSES_PATH);

    try {
      await fs.access(COURSES_PATH);
    } catch (error) {
      console.error('Diretório de cursos não encontrado:', COURSES_PATH);
      return res.status(404).json({ error: 'Diretório de cursos não encontrado' });
    }

    const courses = await fs.readdir(COURSES_PATH, { withFileTypes: true });
    console.log('Cursos encontrados:', courses.map(c => c.name));
    
    const courseData = await Promise.all(
      courses
        .filter(course => course.isDirectory())
        .map(async (course) => {
          const coursePath = join(COURSES_PATH, course.name);
          console.log('Lendo curso:', course.name, 'em:', coursePath);
          const content = await readCourseContent(coursePath);
          
          return {
            title: decodeFileName(course.name),
            description: `Curso de ${decodeFileName(course.name)}`,
            content: content
          };
        })
    );

    res.json(courseData);
  } catch (error) {
    console.error('Erro ao ler cursos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Caminho para o arquivo de cache das durações
const CACHE_PATH = join(__dirname, 'video-durations-cache.json');

// Rota para carregar cache de durações
app.get('/api/video-durations', async (req, res) => {
  try {
    const cacheData = await fs.readFile(CACHE_PATH, 'utf8');
    const durations = JSON.parse(cacheData);
    console.log(`Cache de durações carregado: ${Object.keys(durations).length} vídeos`);
    res.json(durations);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Arquivo não existe ainda, retorna objeto vazio
      console.log('Arquivo de cache não encontrado, criando novo cache');
      res.json({});
    } else {
      console.error('Erro ao carregar cache de durações:', error);
      res.status(500).json({ error: 'Erro ao carregar cache' });
    }
  }
});

// Rota para salvar cache de durações
app.post('/api/video-durations', async (req, res) => {
  try {
    const durations = req.body;
    await fs.writeFile(CACHE_PATH, JSON.stringify(durations, null, 2));
    console.log(`Cache de durações salvo: ${Object.keys(durations).length} vídeos`);
    res.json({ success: true, count: Object.keys(durations).length });
  } catch (error) {
    console.error('Erro ao salvar cache de durações:', error);
    res.status(500).json({ error: 'Erro ao salvar cache' });
  }
});

// Rota para adicionar/atualizar uma duração específica
app.put('/api/video-durations/:videoPath(*)', async (req, res) => {
  try {
    const videoPath = decodeURIComponent(req.params.videoPath);
    const { duration } = req.body;
    
    let durations = {};
    try {
      const cacheData = await fs.readFile(CACHE_PATH, 'utf8');
      durations = JSON.parse(cacheData);
    } catch (error) {
      // Arquivo não existe, começar com objeto vazio
    }
    
    durations[videoPath] = duration;
    await fs.writeFile(CACHE_PATH, JSON.stringify(durations, null, 2));
    
    console.log(`Duração atualizada para ${videoPath}: ${duration}s`);
    res.json({ success: true, videoPath, duration });
  } catch (error) {
    console.error('Erro ao atualizar duração:', error);
    res.status(500).json({ error: 'Erro ao atualizar duração' });
  }
});

// Rota para configurar o caminho dos cursos
app.post('/api/config/courses-path', async (req, res) => {
  try {
    const { path } = req.body;
    
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'Caminho inválido' });
    }
    
    // Verificar se o caminho existe
    try {
      await fs.access(path);
      COURSES_PATH = path.endsWith('/') ? path : path + '/';
      console.log(`Caminho dos cursos atualizado para: ${COURSES_PATH}`);
      res.json({ success: true, path: COURSES_PATH });
    } catch (accessError) {
      console.error('Caminho não encontrado:', path);
      res.status(404).json({ error: 'Caminho não encontrado' });
    }
  } catch (error) {
    console.error('Erro ao configurar caminho dos cursos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para obter o caminho atual dos cursos
app.get('/api/config/courses-path', (req, res) => {
  res.json({ path: COURSES_PATH });
});

// === NOTAS API ===
const NOTES_DIR = '_notas';

const ensureNotesDir = async (courseTitle) => {
  const dir = join(COURSES_PATH, courseTitle, NOTES_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

// Salvar resumo pessoal de uma aula
app.post('/api/notes/:courseTitle/pessoal', async (req, res) => {
  try {
    const { courseTitle } = req.params;
    const { lessonPrefix, content } = req.body;
    const dir = await ensureNotesDir(decodeFileName(courseTitle));
    const safePrefix = lessonPrefix.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = join(dir, `resumo_pessoal_${safePrefix}.txt`);
    await fs.writeFile(filePath, content, 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar nota pessoal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Carregar resumo pessoal de uma aula
app.get('/api/notes/:courseTitle/pessoal/:lessonPrefix', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const dir = join(COURSES_PATH, decodeFileName(courseTitle), NOTES_DIR);
    const safePrefix = lessonPrefix.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = join(dir, `resumo_pessoal_${safePrefix}.txt`);
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ content });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({ content: '' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Salvar reflexão do pomodoro (append ao arquivo do curso)
app.post('/api/notes/:courseTitle/pomodoro', async (req, res) => {
  try {
    const { courseTitle } = req.params;
    const { content } = req.body;
    const dir = await ensureNotesDir(decodeFileName(courseTitle));
    const filePath = join(dir, 'pomodoro_reflexoes.txt');
    const timestamp = new Date().toLocaleString('pt-BR');
    const entry = `\n--- ${timestamp} ---\n${content}\n`;
    await fs.appendFile(filePath, entry, 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar reflexão pomodoro:', error);
    res.status(500).json({ error: error.message });
  }
});

// Carregar todas as reflexões do pomodoro de um curso
app.get('/api/notes/:courseTitle/pomodoro', async (req, res) => {
  try {
    const { courseTitle } = req.params;
    const dir = join(COURSES_PATH, decodeFileName(courseTitle), NOTES_DIR);
    const filePath = join(dir, 'pomodoro_reflexoes.txt');
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ content });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({ content: '' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// === PROGRESSO / NOTAS via Postgres ===

// Helper: decodifica param da URL
const dec = (s) => decodeFileName(s);

// Snapshot de progresso de TODOS os cursos — usado na home
app.get('/api/progress/all', async (_req, res) => {
  try {
    const [lessons, steps] = await Promise.all([
      query('SELECT course_title, lesson_path FROM lesson_progress'),
      query('SELECT course_title, lesson_prefix, step_key FROM step_completions'),
    ]);
    const out = {};
    for (const r of lessons.rows) {
      out[r.course_title] ||= { lessons: {}, steps: {} };
      out[r.course_title].lessons[r.lesson_path] = true;
    }
    for (const r of steps.rows) {
      out[r.course_title] ||= { lessons: {}, steps: {} };
      out[r.course_title].steps[`${r.lesson_prefix}__${r.step_key}`] = true;
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lesson progress (aulas concluidas)
app.get('/api/progress/:courseTitle/lessons', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT lesson_path, completed_at FROM lesson_progress WHERE course_title = $1',
      [dec(req.params.courseTitle)],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/progress/:courseTitle/lessons', async (req, res) => {
  try {
    const { lessonPath } = req.body;
    if (!lessonPath) return res.status(400).json({ error: 'lessonPath obrigatorio' });
    await query(
      `INSERT INTO lesson_progress (course_title, lesson_path)
       VALUES ($1, $2)
       ON CONFLICT (course_title, lesson_path) DO UPDATE SET completed_at = NOW()`,
      [dec(req.params.courseTitle), lessonPath],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/progress/:courseTitle/lessons', async (req, res) => {
  try {
    const { lessonPath } = req.body;
    await query(
      'DELETE FROM lesson_progress WHERE course_title = $1 AND lesson_path = $2',
      [dec(req.params.courseTitle), lessonPath],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step completions (etapas dentro da aula)
app.get('/api/progress/:courseTitle/steps', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT lesson_prefix, step_key, completed_at FROM step_completions WHERE course_title = $1',
      [dec(req.params.courseTitle)],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/progress/:courseTitle/steps', async (req, res) => {
  try {
    const { lessonPrefix, stepKey } = req.body;
    if (!lessonPrefix || !stepKey)
      return res.status(400).json({ error: 'lessonPrefix e stepKey obrigatorios' });
    await query(
      `INSERT INTO step_completions (course_title, lesson_prefix, step_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (course_title, lesson_prefix, step_key) DO UPDATE SET completed_at = NOW()`,
      [dec(req.params.courseTitle), lessonPrefix, stepKey],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/progress/:courseTitle/steps', async (req, res) => {
  try {
    const { lessonPrefix, stepKey } = req.body;
    await query(
      'DELETE FROM step_completions WHERE course_title = $1 AND lesson_prefix = $2 AND step_key = $3',
      [dec(req.params.courseTitle), lessonPrefix, stepKey],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resumo pessoal (antes em arquivo .txt)
app.get('/api/db/notes/:courseTitle/pessoal/:lessonPrefix', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT content, updated_at FROM personal_notes WHERE course_title = $1 AND lesson_prefix = $2',
      [dec(req.params.courseTitle), dec(req.params.lessonPrefix)],
    );
    res.json({ content: rows[0]?.content || '', updated_at: rows[0]?.updated_at || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/notes/:courseTitle/pessoal', async (req, res) => {
  try {
    const { lessonPrefix, content } = req.body;
    if (!lessonPrefix) return res.status(400).json({ error: 'lessonPrefix obrigatorio' });
    await query(
      `INSERT INTO personal_notes (course_title, lesson_prefix, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (course_title, lesson_prefix)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [dec(req.params.courseTitle), lessonPrefix, content ?? ''],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pomodoro sessions
app.get('/api/db/notes/:courseTitle/pomodoro', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, lesson_prefix, content, created_at
       FROM pomodoro_sessions
       WHERE course_title = $1
       ORDER BY created_at ASC`,
      [dec(req.params.courseTitle)],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/notes/:courseTitle/pomodoro', async (req, res) => {
  try {
    const { content, lessonPrefix, kind } = req.body;
    if (!content) return res.status(400).json({ error: 'content obrigatorio' });
    const allowedKinds = new Set(['reflection', 'focus', 'break_active', 'break_passive']);
    const safeKind = allowedKinds.has(kind) ? kind : 'reflection';
    const { rows } = await query(
      `INSERT INTO pomodoro_sessions (course_title, lesson_prefix, content, kind)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at, kind`,
      [dec(req.params.courseTitle), lessonPrefix || null, content, safeKind],
    );
    res.json({ success: true, ...rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diario semanal
app.get('/api/db/diary/:courseTitle', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT week_key, learned, decisions, different, updated_at
       FROM weekly_diaries WHERE course_title = $1`,
      [dec(req.params.courseTitle)],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/diary/:courseTitle', async (req, res) => {
  try {
    const { weekKey, learned, decisions, different } = req.body;
    if (!weekKey) return res.status(400).json({ error: 'weekKey obrigatorio' });
    await query(
      `INSERT INTO weekly_diaries (course_title, week_key, learned, decisions, different, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (course_title, week_key)
       DO UPDATE SET learned = EXCLUDED.learned,
                     decisions = EXCLUDED.decisions,
                     different = EXCLUDED.different,
                     updated_at = NOW()`,
      [dec(req.params.courseTitle), weekKey, learned ?? '', decisions ?? '', different ?? ''],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Migracao one-shot: recebe payload do localStorage do frontend e grava tudo no Postgres
app.post('/api/migrate-localstorage', async (req, res) => {
  try {
    const payload = req.body || {};
    const summary = { lessons: 0, steps: 0, diaries: 0, notes: 0, pomodoros: 0 };

    for (const entry of payload.lessons || []) {
      await query(
        `INSERT INTO lesson_progress (course_title, lesson_path)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [entry.courseTitle, entry.lessonPath],
      );
      summary.lessons++;
    }

    for (const entry of payload.steps || []) {
      await query(
        `INSERT INTO step_completions (course_title, lesson_prefix, step_key)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [entry.courseTitle, entry.lessonPrefix, entry.stepKey],
      );
      summary.steps++;
    }

    for (const entry of payload.diaries || []) {
      await query(
        `INSERT INTO weekly_diaries (course_title, week_key, learned, decisions, different)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (course_title, week_key) DO UPDATE SET
           learned = EXCLUDED.learned,
           decisions = EXCLUDED.decisions,
           different = EXCLUDED.different,
           updated_at = NOW()`,
        [entry.courseTitle, entry.weekKey, entry.learned ?? '', entry.decisions ?? '', entry.different ?? ''],
      );
      summary.diaries++;
    }

    for (const entry of payload.notes || []) {
      await query(
        `INSERT INTO personal_notes (course_title, lesson_prefix, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (course_title, lesson_prefix) DO UPDATE SET
           content = EXCLUDED.content, updated_at = NOW()`,
        [entry.courseTitle, entry.lessonPrefix, entry.content ?? ''],
      );
      summary.notes++;
    }

    for (const entry of payload.pomodoros || []) {
      await query(
        `INSERT INTO pomodoro_sessions (course_title, lesson_prefix, content)
         VALUES ($1, $2, $3)`,
        [entry.courseTitle, entry.lessonPrefix || null, entry.content],
      );
      summary.pomodoros++;
    }

    res.json({ success: true, summary });
  } catch (err) {
    console.error('Erro na migracao:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health do DB
app.get('/api/db/health', async (_req, res) => {
  const ok = await ensureReady();
  res.status(ok ? 200 : 503).json({ ok });
});

// === FLASHCARDS / FSRS (Fase 2) ===

// Importa o deck a partir do arquivo .txt da aula
app.post('/api/flashcards/:courseTitle/:lessonPrefix/import', async (req, res) => {
  try {
    const result = await importDeck({
      coursesPath: COURSES_PATH,
      courseTitle: dec(req.params.courseTitle),
      lessonPrefix: dec(req.params.lessonPrefix),
    });
    res.json(result);
  } catch (err) {
    const code = err.code === 'NO_FLASHCARD_FILE' ? 404 : 500;
    res.status(code).json({ error: err.message });
  }
});

// Lista cards + estado FSRS do deck (retorna 404 se ainda nao importado)
app.get('/api/flashcards/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const deck = await getDeck({
      courseTitle: dec(req.params.courseTitle),
      lessonPrefix: dec(req.params.lessonPrefix),
    });
    if (!deck) return res.status(404).json({ error: 'deck nao importado' });
    res.json(deck);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cards vencidos (revisao diaria). ?courseTitle=... opcional; ?limit=... opcional
app.get('/api/flashcards/due', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const courseTitle = req.query.courseTitle ? dec(req.query.courseTitle) : null;
    const cards = await getDueCards({ courseTitle, limit });
    res.json({ count: cards.length, cards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resumo agregado por curso (badges)
app.get('/api/flashcards/summary', async (_req, res) => {
  try {
    const rows = await getDueSummary();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Grupos de cards com fronts similares (confusao semantica). Opcionalmente
// filtra por curso. Agrupa via Jaccard + union-find. Retorna cards junto com
// course_title e lesson_prefix pra navegacao.
app.get('/api/flashcards/confusion', async (req, res) => {
  try {
    const courseTitle = req.query.courseTitle || null;
    const minLapses = Math.max(1, Number(req.query.minLapses) || 2);
    const threshold = Math.min(0.99, Math.max(0.1, Number(req.query.threshold) || 0.4));

    const params = [minLapses];
    let where = 'COALESCE(r.lapses, 0) >= $1';
    if (courseTitle) {
      params.push(courseTitle);
      where += ` AND d.course_title = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT c.id, c.front, c.back, COALESCE(r.lapses, 0)::int AS lapses,
              COALESCE(r.reps, 0)::int AS reps,
              d.course_title, d.lesson_prefix
       FROM flashcards c
       JOIN flashcard_decks d ON d.id = c.deck_id
       LEFT JOIN flashcard_reviews r ON r.card_id = c.id
       WHERE ${where}`,
      params,
    );

    const groups = findConfusionGroups(rows, { threshold, minLapses });
    // Serializa pro frontend
    res.json({
      threshold,
      minLapses,
      groups: groups.map((g) => ({
        totalLapses: g.totalLapses,
        cards: g.cards.map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
          lapses: c.lapses,
          reps: c.reps,
          courseTitle: c.course_title,
          lessonPrefix: c.lesson_prefix,
        })),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registra review de um card (rating 1..4)
app.post('/api/flashcards/review/:cardId', async (req, res) => {
  try {
    const cardId = Number(req.params.cardId);
    if (!Number.isFinite(cardId)) return res.status(400).json({ error: 'cardId invalido' });
    const rating = Number(req.body?.rating);
    const result = await reviewCard({ cardId, rating });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// === Estatistica recente (pro Pomodoro adaptativo) ===
app.get('/api/stats/recent', async (_req, res) => {
  try {
    const acc = await query(
      `SELECT
         COUNT(*)::int AS n,
         SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END)::int AS hits
       FROM flashcard_review_log
       WHERE reviewed_at >= NOW() - INTERVAL '7 days'`,
    );
    const row = acc.rows[0] || { n: 0, hits: 0 };
    const accuracy7d = row.n > 0 ? row.hits / row.n : null;
    res.json({ accuracy7d, reviews7d: row.n });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Dashboard de estudo ===
app.get('/api/stats/dashboard', async (_req, res) => {
  try {
    // Heatmap: atividade diaria dos ultimos 90 dias (reviews + pomodoros)
    const heatmap = await query(
      `WITH days AS (
         SELECT generate_series(
           (CURRENT_DATE - INTERVAL '89 days')::date,
           CURRENT_DATE,
           '1 day'
         )::date AS day
       ),
       reviews AS (
         SELECT reviewed_at::date AS day, COUNT(*)::int AS n
         FROM flashcard_review_log
         WHERE reviewed_at >= CURRENT_DATE - INTERVAL '89 days'
         GROUP BY 1
       ),
       pomos AS (
         SELECT created_at::date AS day, COUNT(*)::int AS n
         FROM pomodoro_sessions
         WHERE created_at >= CURRENT_DATE - INTERVAL '89 days'
         GROUP BY 1
       )
       SELECT d.day,
              COALESCE(r.n, 0) AS reviews,
              COALESCE(p.n, 0) AS pomodoros
       FROM days d
       LEFT JOIN reviews r ON r.day = d.day
       LEFT JOIN pomos p ON p.day = d.day
       ORDER BY d.day`,
    );

    // Retencao por curso: acertos/total em 7d e 30d (rating >= 3 = Good/Easy conta como acerto)
    const retention = await query(
      `SELECT d.course_title,
              SUM(CASE WHEN rl.reviewed_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS n_7d,
              SUM(CASE WHEN rl.reviewed_at >= NOW() - INTERVAL '7 days' AND rl.rating >= 3 THEN 1 ELSE 0 END)::int AS hit_7d,
              SUM(CASE WHEN rl.reviewed_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END)::int AS n_30d,
              SUM(CASE WHEN rl.reviewed_at >= NOW() - INTERVAL '30 days' AND rl.rating >= 3 THEN 1 ELSE 0 END)::int AS hit_30d
       FROM flashcard_review_log rl
       JOIN flashcards c ON c.id = rl.card_id
       JOIN flashcard_decks d ON d.id = c.deck_id
       WHERE rl.reviewed_at >= NOW() - INTERVAL '30 days'
       GROUP BY d.course_title
       ORDER BY n_30d DESC`,
    );

    // Top cards que mais deram lapsos
    const topLapses = await query(
      `SELECT c.id, c.front, d.course_title, d.lesson_prefix,
              r.lapses, r.reps
       FROM flashcards c
       JOIN flashcard_decks d ON d.id = c.deck_id
       JOIN flashcard_reviews r ON r.card_id = c.id
       WHERE r.lapses >= 1
       ORDER BY r.lapses DESC, r.reps DESC
       LIMIT 10`,
    );

    // Backlog ETA: cards due / ritmo medio (reviews/dia nos ultimos 14d)
    const backlogRes = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM flashcard_reviews r WHERE r.due <= NOW()) +
         (SELECT COUNT(*)::int FROM flashcards c WHERE NOT EXISTS (
            SELECT 1 FROM flashcard_reviews fr WHERE fr.card_id = c.id
         )) AS due_cards,
         (SELECT COUNT(*)::numeric FROM flashcard_review_log
          WHERE reviewed_at >= NOW() - INTERVAL '14 days') / 14.0 AS avg_per_day`,
    );
    const b = backlogRes.rows[0] || {};
    const avgPerDay = Number(b.avg_per_day) || 0;
    const dueCards = Number(b.due_cards) || 0;
    const etaDays = avgPerDay > 0 ? Math.ceil(dueCards / avgPerDay) : null;

    res.json({
      heatmap: heatmap.rows,
      retention: retention.rows,
      topLapses: topLapses.rows,
      backlog: { dueCards, avgPerDay: Number(avgPerDay.toFixed(2)), etaDays },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Perfil cognitivo (agregado do usuario) ===
// Hora otima do dia, streak, drift de dificuldade, totais.
app.get('/api/stats/profile', async (_req, res) => {
  try {
    // Acerto por hora do dia nos ultimos 30d (requer ao menos 5 reviews naquela hora pra contar).
    const hours = await query(
      `SELECT EXTRACT(HOUR FROM reviewed_at)::int AS hr,
              COUNT(*)::int AS n,
              SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END)::int AS hits
       FROM flashcard_review_log
       WHERE reviewed_at >= NOW() - INTERVAL '30 days'
       GROUP BY hr
       HAVING COUNT(*) >= 5
       ORDER BY hr`,
    );

    let bestHour = null;
    let worstHour = null;
    if (hours.rows.length > 0) {
      const ranked = hours.rows.map((r) => ({ ...r, acc: r.hits / r.n }));
      const byAcc = [...ranked].sort((a, b) => b.acc - a.acc);
      bestHour = { hour: byAcc[0].hr, accuracy: byAcc[0].acc, n: byAcc[0].n };
      worstHour = {
        hour: byAcc[byAcc.length - 1].hr,
        accuracy: byAcc[byAcc.length - 1].acc,
        n: byAcc[byAcc.length - 1].n,
      };
    }

    // Streak: dias consecutivos terminando hoje (ou ontem) com >=1 review.
    const days = await query(
      `SELECT DISTINCT reviewed_at::date AS day
       FROM flashcard_review_log
       WHERE reviewed_at >= CURRENT_DATE - INTERVAL '365 days'
       ORDER BY day DESC`,
    );
    let streak = 0;
    if (days.rows.length > 0) {
      const daySet = new Set(days.rows.map((r) => new Date(r.day).toISOString().slice(0, 10)));
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      // Permite comecar hoje ou ontem (usuario pode nao ter estudado hoje ainda)
      let start = new Date(today);
      if (!daySet.has(start.toISOString().slice(0, 10))) {
        start.setUTCDate(start.getUTCDate() - 1);
      }
      while (daySet.has(start.toISOString().slice(0, 10))) {
        streak++;
        start.setUTCDate(start.getUTCDate() - 1);
      }
    }

    // Drift de dificuldade: diferenca entre D medio recente (7d) e anterior (7-30d).
    const drift = await query(
      `SELECT
         AVG(difficulty) FILTER (WHERE reviewed_at >= NOW() - INTERVAL '7 days') AS d_recent,
         AVG(difficulty) FILTER (WHERE reviewed_at >= NOW() - INTERVAL '30 days'
                                   AND reviewed_at <  NOW() - INTERVAL '7 days') AS d_prev
       FROM flashcard_review_log
       WHERE reviewed_at >= NOW() - INTERVAL '30 days' AND difficulty IS NOT NULL`,
    );
    const dRecent = drift.rows[0]?.d_recent != null ? Number(drift.rows[0].d_recent) : null;
    const dPrev = drift.rows[0]?.d_prev != null ? Number(drift.rows[0].d_prev) : null;
    const difficultyDrift =
      dRecent != null && dPrev != null ? Number((dRecent - dPrev).toFixed(3)) : null;

    // Totais
    const totals = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM flashcards) AS total_cards,
         (SELECT COUNT(*)::int FROM flashcard_review_log) AS total_reviews,
         (SELECT COUNT(*)::int FROM flashcard_reviews WHERE state >= 2) AS mature_cards`,
    );
    const t = totals.rows[0] || { total_cards: 0, total_reviews: 0, mature_cards: 0 };

    res.json({
      bestHour,
      worstHour,
      hourly: hours.rows.map((r) => ({
        hour: r.hr,
        n: r.n,
        accuracy: r.n > 0 ? r.hits / r.n : null,
      })),
      streak,
      difficulty: {
        recent: dRecent != null ? Number(dRecent.toFixed(3)) : null,
        prev: dPrev != null ? Number(dPrev.toFixed(3)) : null,
        drift: difficultyDrift,
      },
      totals: {
        cards: Number(t.total_cards),
        reviews: Number(t.total_reviews),
        matureCards: Number(t.mature_cards),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Diario tecnico por aula ===
app.get('/api/db/diary-tecnico/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const { rows } = await query(
      `SELECT content, updated_at FROM technical_diary_notes
       WHERE course_title = $1 AND lesson_prefix = $2`,
      [courseTitle, lessonPrefix],
    );
    res.json(rows[0] || { content: '', updated_at: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/diary-tecnico/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const content = String(req.body?.content ?? '');
    const { rows } = await query(
      `INSERT INTO technical_diary_notes (course_title, lesson_prefix, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (course_title, lesson_prefix)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
       RETURNING content, updated_at`,
      [courseTitle, lessonPrefix, content],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Quiz tracking ===
app.post('/api/quiz/:courseTitle/:lessonPrefix/attempts', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const score = Number(req.body?.score);
    const total = Number(req.body?.total);
    if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'score/total invalidos' });
    }
    const { rows } = await query(
      `INSERT INTO quiz_attempts (course_title, lesson_prefix, score, total)
       VALUES ($1,$2,$3,$4)
       RETURNING id, score, total, answered_at`,
      [courseTitle, lessonPrefix, score, total],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quiz/:courseTitle/:lessonPrefix/attempts', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const { rows } = await query(
      `SELECT id, score, total, answered_at
       FROM quiz_attempts
       WHERE course_title = $1 AND lesson_prefix = $2
       ORDER BY answered_at DESC
       LIMIT 20`,
      [courseTitle, lessonPrefix],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Acerto por aula dentro de um curso, nos ultimos N dias (default 30).
// Usado para badges de "revisar" nos modulos + banner que sugere revisao.
app.get('/api/stats/lesson-accuracy/:courseTitle', async (req, res) => {
  try {
    const { courseTitle } = req.params;
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const { rows } = await query(
      `SELECT d.lesson_prefix,
              COUNT(*)::int AS total,
              SUM(CASE WHEN l.rating >= 3 THEN 1 ELSE 0 END)::int AS correct,
              MAX(l.reviewed_at) AS last_review
       FROM flashcard_review_log l
       JOIN flashcards c ON c.id = l.card_id
       JOIN flashcard_decks d ON d.id = c.deck_id
       WHERE d.course_title = $1
         AND l.reviewed_at >= NOW() - ($2::int || ' days')::interval
       GROUP BY d.lesson_prefix`,
      [courseTitle, days],
    );
    const data = rows.map((r) => ({
      lessonPrefix: r.lesson_prefix,
      total: r.total,
      correct: r.correct,
      accuracy: r.total > 0 ? r.correct / r.total : null,
      lastReview: r.last_review,
    }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Converte questoes erradas em flashcards no deck da aula.
// Body: { items: [{ front, back }] }
// Faz upsert do deck (se nao existir) e dedup por front+back (nao insere duplicados).
app.post('/api/quiz/:courseTitle/:lessonPrefix/wrong-to-flashcards', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const valid = items
      .map((i) => ({
        front: String(i?.front || '').trim(),
        back: String(i?.back || '').trim(),
      }))
      .filter((i) => i.front && i.back);

    if (valid.length === 0) {
      return res.status(400).json({ error: 'items vazios ou invalidos' });
    }

    const deckRes = await query(
      `INSERT INTO flashcard_decks (course_title, lesson_prefix, source_file)
       VALUES ($1, $2, NULL)
       ON CONFLICT (course_title, lesson_prefix)
       DO UPDATE SET imported_at = flashcard_decks.imported_at
       RETURNING id`,
      [courseTitle, lessonPrefix],
    );
    const deckId = deckRes.rows[0].id;

    const existing = await query(
      'SELECT front, back FROM flashcards WHERE deck_id = $1',
      [deckId],
    );
    const existingSet = new Set(
      existing.rows.map((r) => `${r.front}||${r.back}`),
    );

    let inserted = 0;
    for (const item of valid) {
      const key = `${item.front}||${item.back}`;
      if (existingSet.has(key)) continue;
      await query(
        `INSERT INTO flashcards (deck_id, front, back, card_type, tags)
         VALUES ($1, $2, $3, 'quiz_wrong', ARRAY['quiz'])`,
        [deckId, item.front, item.back],
      );
      inserted++;
    }

    res.json({ deckId, received: valid.length, inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === IA: geracao de conteudo via DeepSeek ===
// Gera arquivos _ia (resumo, quiz, flashcards, diario) a partir da transcricao .vtt
const ALLOWED_KINDS = new Set(['resumo', 'quiz', 'flashcards', 'diario', 'exemplos']);

app.post('/api/ia/generate', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix, kinds, model } = req.body || {};
    if (!courseTitle || !lessonPrefix) {
      return res.status(400).json({ error: 'courseTitle e lessonPrefix obrigatorios' });
    }
    const wanted = Array.isArray(kinds) ? kinds : [];
    const filtered = wanted.filter((k) => ALLOWED_KINDS.has(k));
    if (filtered.length === 0) {
      return res.status(400).json({
        error: `kinds invalidos. Use subset de: ${[...ALLOWED_KINDS].join(', ')}`,
      });
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: 'DEEPSEEK_API_KEY nao configurada no .env' });
    }
    const out = await generateForLesson({
      coursesPath: COURSES_PATH,
      courseTitle,
      lessonPrefix,
      kinds: filtered,
      model: model || DEEPSEEK_DEFAULT_MODEL,
    });
    res.json(out);
  } catch (err) {
    const code =
      err.code === 'NO_TRANSCRIPT' || err.code === 'NO_LESSON_DIR'
        ? 404
        : err.code === 'EMPTY_TRANSCRIPT'
          ? 422
          : 500;
    res.status(code).json({ error: err.message, code: err.code });
  }
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Pasta de cursos: ${COURSES_PATH}`);
  const ok = await ensureReady();
  console.log(ok ? 'Postgres conectado.' : 'AVISO: Postgres indisponivel (usando fallback).');
});
