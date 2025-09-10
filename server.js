import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import cors from 'cors';
import { createReadStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Caminho absoluto para a pasta de cursos (configurável)
let COURSES_PATH = '/mnt/nvme2/kadabra/Downloads/cursos/';

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
  const validExtensions = ['.mp4', '.webm', '.ts', '.m3u8', '.pdf', '.html'];
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
    'pdf': 'application/pdf',
    'html': 'text/html'
  };
  return contentTypes[ext] || 'application/octet-stream';
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

    // Função para extrair número do início do título
    const extractNumber = (title) => {
      const match = title.match(/^(\d+)/);
      return match ? parseInt(match[1]) : 0;
    };

    // Ordenação natural considerando números e texto
    return content.sort((a, b) => {
      const numA = extractNumber(a.title);
      const numB = extractNumber(b.title);

      if (numA !== numB) {
        return numA - numB;
      }

      return a.title.localeCompare(b.title, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    });
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Pasta de cursos: ${COURSES_PATH}`);
});
