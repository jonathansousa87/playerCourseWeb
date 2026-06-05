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

const app = express();

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

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
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
