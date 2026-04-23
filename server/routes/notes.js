// Notas salvas em arquivos do filesystem do curso (legacy). As variantes em
// /api/db/* em `./progress.js` gravam no Postgres — e devem ser o caminho
// preferido. Mantidas aqui pra compatibilidade com frontends antigos.

import express from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getCoursesPath } from '../config.js';

const router = express.Router();
const NOTES_DIR = '_notas';

const dec = (s) => decodeURIComponent(s);

const ensureNotesDir = async (courseTitle) => {
  const dir = join(getCoursesPath(), courseTitle, NOTES_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const safePrefixOf = (lessonPrefix) => lessonPrefix.replace(/[^a-zA-Z0-9._-]/g, '_');

router.post('/api/notes/:courseTitle/pessoal', async (req, res) => {
  try {
    const { courseTitle } = req.params;
    const { lessonPrefix, content } = req.body;
    const dir = await ensureNotesDir(dec(courseTitle));
    const filePath = join(dir, `resumo_pessoal_${safePrefixOf(lessonPrefix)}.txt`);
    await fs.writeFile(filePath, content, 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar nota pessoal:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/notes/:courseTitle/pessoal/:lessonPrefix', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const dir = join(getCoursesPath(), dec(courseTitle), NOTES_DIR);
    const filePath = join(dir, `resumo_pessoal_${safePrefixOf(lessonPrefix)}.txt`);
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

router.post('/api/notes/:courseTitle/pomodoro', async (req, res) => {
  try {
    const { courseTitle } = req.params;
    const { content } = req.body;
    const dir = await ensureNotesDir(dec(courseTitle));
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

router.get('/api/notes/:courseTitle/pomodoro', async (req, res) => {
  try {
    const { courseTitle } = req.params;
    const dir = join(getCoursesPath(), dec(courseTitle), NOTES_DIR);
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

export default router;
