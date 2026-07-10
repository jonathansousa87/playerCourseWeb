import './server/load-env.js';
import express from 'express';
import cors from 'cors';
import { ensureReady } from './db/index.js';
import { getCoursesPath, getCourseSource, getDriveFolderId } from './server/config.js';
import { loadCredsFromDB } from './server/load-creds-from-db.js';
import { requireAuth } from './server/auth.js';

import driveRouter from './server/routes/drive.js';
import materialsRouter from './server/routes/materials.js';
import coursesRouter from './server/routes/courses.js';
import notesRouter from './server/routes/notes.js';
import progressRouter from './server/routes/progress.js';
import flashcardsRouter from './server/routes/flashcards.js';
import quizRouter from './server/routes/quiz.js';
import statsRouter from './server/routes/stats.js';
import iaRouter from './server/routes/ia.js';
import typingRouter from './server/routes/typing.js';
import maintenanceRouter from './server/routes/maintenance.js';
import meRouter from './server/routes/me.js';
import adminRouter from './server/routes/admin.js';

import { stopVl } from './server/ai/ocr/visionServer.mjs';
import { stopQwen } from './server/ai/qwenServer.js';
import { stopKokoro } from './server/ai/kokoro.js';

const app = express();

// Derruba os modelos (llama-server VL/Qwen + Kokoro) ao encerrar o backend.
// Sem isso, um Ctrl+C / stop.sh no MEIO de um processamento deixava os
// llama-server (spawnados `detached`) ORFAOS: seguravam ~10GB de RAM (GGUF
// mmap + buffers pinned do CUDA) e a VRAM, e o run seguinte nao cabia na GPU
// (o PaddleOCR caia pra CPU). Kill dirigido pela existencia do processo.
let shuttingDown = false;
const shutdownModels = async (sig) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] ${sig}: derrubando modelos (VL/Qwen/Kokoro)...`);
  try {
    await Promise.allSettled([
      stopVl({ log: (m) => console.log(m) }),
      stopQwen({ log: (m) => console.log(m) }),
      stopKokoro({ log: (m) => console.log(m) }),
    ]);
  } catch { /* best-effort */ }
  process.exit(0);
};
process.on('SIGINT', () => shutdownModels('SIGINT'));
process.on('SIGTERM', () => shutdownModels('SIGTERM'));

// CORS com credentials para o cliente Vite (porta 5173 por padrao)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

// Headers extras para streaming de video (Range requests) — Allow-Origin ja e
// tratado pelo cors() acima; so expoe os headers de range necessarios.
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Headers', 'Range, Authorization');
  res.header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length');
  next();
});

// Drive OAuth callback nao requer Authorization header (e a propria origem)
app.use(driveRouter);

// Middleware de autenticacao aplicado a todos os /api/* subsequentes
app.use(requireAuth);

app.use(materialsRouter);
app.use(coursesRouter);
app.use(notesRouter);
app.use(progressRouter);
app.use(flashcardsRouter);
app.use(quizRouter);
app.use(statsRouter);
app.use(iaRouter);
app.use(typingRouter);
app.use(maintenanceRouter);
app.use(meRouter);
app.use(adminRouter);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  // Limpa llama-server ORFAOS de uma execucao anterior encerrada no meio
  // (stop.sh/kill nao derruba os detached). Se sobrar um VL/Qwen vivo, ele
  // segura VRAM/RAM e o PaddleOCR nao cabe na GPU -> cai pra CPU. No-op rapido
  // se nao houver nenhum.
  try {
    await Promise.allSettled([stopVl({ log: () => {} }), stopQwen({ log: () => {} })]);
    console.log('[boot] llama-server orfaos verificados/limpos.');
  } catch { /* best-effort */ }

  const ok = await ensureReady();
  console.log(ok ? 'Postgres conectado.' : 'AVISO: Postgres indisponivel (usando fallback).');

  // Carrega credenciais salvas pela UI (user_settings) para o process.env.
  if (ok) await loadCredsFromDB();

  const source = getCourseSource();
  if (source === 'drive') {
    console.log(`Fonte de cursos: Drive (pasta ${getDriveFolderId() || 'NAO CONFIGURADA'})`);
  } else {
    console.log(`Fonte de cursos: filesystem (${getCoursesPath()})`);
  }
});
