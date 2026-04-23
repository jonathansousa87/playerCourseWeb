import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ensureReady } from './db/index.js';
import { getCoursesPath } from './server/config.js';

import coursesRouter from './server/routes/courses.js';
import notesRouter from './server/routes/notes.js';
import progressRouter from './server/routes/progress.js';
import flashcardsRouter from './server/routes/flashcards.js';
import quizRouter from './server/routes/quiz.js';
import statsRouter from './server/routes/stats.js';
import iaRouter from './server/routes/ia.js';

const app = express();
app.use(cors());
app.use(express.json());

// Headers pra streaming de video (Range requests).
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Range');
  res.header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length');
  next();
});

app.use(coursesRouter);
app.use(notesRouter);
app.use(progressRouter);
app.use(flashcardsRouter);
app.use(quizRouter);
app.use(statsRouter);
app.use(iaRouter);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Pasta de cursos: ${getCoursesPath()}`);
  const ok = await ensureReady();
  console.log(ok ? 'Postgres conectado.' : 'AVISO: Postgres indisponivel (usando fallback).');
});
