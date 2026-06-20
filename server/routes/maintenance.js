// Deteccao e limpeza de cursos "orfaos": que existem no banco mas nao na fonte
// atual (ex.: voce renomeou a pasta no Drive). NUNCA apaga sozinho — so lista
// pra o usuario decidir e limpa quando ele confirma.

import express from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { query } from '../../db/index.js';
import { getCoursesPath, getCourseSource, getDriveFolderId } from '../config.js';

const router = express.Router();
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// Tabelas com course_title. scope 'global' = sem user_id (materiais/cache
// gerados); 'user' = por usuario. Nomes fixos (sem injecao).
const TABLES = [
  { name: 'lesson_materials', scope: 'global', label: 'materiais' },
  { name: 'lesson_prequestions', scope: 'global', label: 'pre-quiz (perguntas)' },
  { name: 'interview_questions', scope: 'global', label: 'entrevista (perguntas)' },
  { name: 'lesson_progress', scope: 'user', label: 'aulas concluidas' },
  { name: 'step_completions', scope: 'user', label: 'etapas concluidas' },
  { name: 'personal_notes', scope: 'user', label: 'resumos pessoais' },
  { name: 'pomodoro_sessions', scope: 'user', label: 'pomodoros' },
  { name: 'weekly_diaries', scope: 'user', label: 'diarios semanais' },
  { name: 'flashcard_decks', scope: 'user', label: 'decks de flashcards' },
  { name: 'technical_diary_notes', scope: 'user', label: 'diarios tecnicos' },
  { name: 'quiz_attempts', scope: 'user', label: 'tentativas de quiz' },
  { name: 'lesson_chats', scope: 'user', label: 'mensagens de chat' },
  { name: 'prequestion_attempts', scope: 'user', label: 'tentativas de pre-quiz' },
  { name: 'view_sessions', scope: 'user', label: 'sessoes de leitura' },
  { name: 'interview_sessions', scope: 'user', label: 'entrevistas feitas' },
];

// Lista os titulos de curso que EXISTEM na fonte ativa (Drive ou disco).
// Lanca se a fonte estiver indisponivel (pra nao marcar tudo como orfao a toa).
const listSourceCourses = async () => {
  if (getCourseSource() === 'drive') {
    const folderId = getDriveFolderId();
    if (!folderId) throw new Error('DRIVE_COURSES_FOLDER_ID nao configurado');
    const { listFolders } = await import('../drive/index.js');
    const folders = await listFolders(folderId);
    return new Set((folders || []).map((f) => f.name));
  }
  const entries = await fs.readdir(getCoursesPath(), { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => dec(e.name)));
};

// Apaga TODAS as linhas do curso no banco (global por course_title; user por user_id).
const wipeCourseFromDb = async (course, userId) => {
  const deleted = {};
  for (const t of TABLES) {
    try {
      const sql = t.scope === 'global'
        ? `DELETE FROM ${t.name} WHERE course_title = $1`
        : `DELETE FROM ${t.name} WHERE course_title = $1 AND user_id = $2`;
      const r = await query(sql, t.scope === 'global' ? [course] : [course, userId]);
      if (r.rowCount) deleted[t.label] = r.rowCount;
    } catch { /* tabela ausente */ }
  }
  return { deleted, total: Object.values(deleted).reduce((a, b) => a + b, 0) };
};

// Troca course_title em todas as tabelas (mantem progresso/materiais atrelados).
const renameCourseInDb = async (from, to, userId) => {
  const updated = {};
  const errors = [];
  for (const t of TABLES) {
    try {
      const sql = t.scope === 'global'
        ? `UPDATE ${t.name} SET course_title = $2 WHERE course_title = $1`
        : `UPDATE ${t.name} SET course_title = $2 WHERE course_title = $1 AND user_id = $3`;
      const r = await query(sql, t.scope === 'global' ? [from, to] : [from, to, userId]);
      if (r.rowCount) updated[t.label] = r.rowCount;
    } catch (e) { errors.push(`${t.name}: ${e.message}`); }
  }
  return { updated, errors };
};

// Nome real do diretorio (filesystem) cujo nome decodificado bate com o titulo.
const findCourseDir = async (courseTitle) => {
  const entries = await fs.readdir(getCoursesPath(), { withFileTypes: true });
  const hit = entries.find((e) => e.isDirectory() && dec(e.name) === courseTitle);
  return hit ? hit.name : null;
};

const sourceHasCourse = async (course) => {
  if (getCourseSource() === 'drive') {
    const { findFolderByName } = await import('../drive/index.js');
    return !!(await findFolderByName(getDriveFolderId(), course));
  }
  return !!(await findCourseDir(course));
};

const renameSourceFolder = async (from, to) => {
  if (getCourseSource() === 'drive') {
    const { findFolderByName, renameFile } = await import('../drive/index.js');
    const folder = await findFolderByName(getDriveFolderId(), from);
    if (!folder) return false;
    await renameFile(folder.id, to);
    return true;
  }
  const dirName = await findCourseDir(from);
  if (!dirName) return false;
  await fs.rename(join(getCoursesPath(), dirName), join(getCoursesPath(), to));
  return true;
};

const deleteSourceFolder = async (course) => {
  if (getCourseSource() === 'drive') {
    const { findFolderByName, deleteFile } = await import('../drive/index.js');
    const folder = await findFolderByName(getDriveFolderId(), course);
    if (!folder) return false;
    await deleteFile(folder.id);
    return true;
  }
  const dirName = await findCourseDir(course);
  if (!dirName) return false;
  await fs.rm(join(getCoursesPath(), dirName), { recursive: true, force: true });
  return true;
};

const countFor = async (table, scope, course, userId) => {
  try {
    const sql = scope === 'global'
      ? `SELECT count(*)::int AS n FROM ${table} WHERE course_title = $1`
      : `SELECT count(*)::int AS n FROM ${table} WHERE course_title = $1 AND user_id = $2`;
    const { rows } = await query(sql, scope === 'global' ? [course] : [course, userId]);
    return rows[0]?.n || 0;
  } catch {
    return 0; // tabela pode nao existir em DB sem a migration — ignora
  }
};

// GET /api/maintenance/orphan-courses — cursos no banco que sumiram da fonte.
router.get('/api/maintenance/orphan-courses', async (req, res) => {
  try {
    let sourceSet;
    try {
      sourceSet = await listSourceCourses();
    } catch (e) {
      // Fonte indisponivel: nao arrisca marcar tudo como orfao.
      return res.json({ orphans: [], warning: `Fonte de cursos indisponivel (${e.message}).` });
    }

    // Titulos presentes no banco.
    const dbTitles = new Set();
    for (const t of TABLES) {
      try {
        const sql = t.scope === 'global'
          ? `SELECT DISTINCT course_title FROM ${t.name}`
          : `SELECT DISTINCT course_title FROM ${t.name} WHERE user_id = $1`;
        const { rows } = await query(sql, t.scope === 'global' ? [] : [req.userId]);
        for (const r of rows) if (r.course_title) dbTitles.add(r.course_title);
      } catch { /* tabela ausente — ignora */ }
    }

    const orphanTitles = [...dbTitles].filter((title) => !sourceSet.has(title));

    const orphans = [];
    for (const course of orphanTitles) {
      const counts = {};
      let total = 0;
      for (const t of TABLES) {
        const n = await countFor(t.name, t.scope, course, req.userId);
        if (n > 0) { counts[t.label] = n; total += n; }
      }
      orphans.push({ course_title: course, counts, total });
    }
    orphans.sort((a, b) => b.total - a.total);
    res.json({ orphans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/maintenance/course/:course — apaga so do BANCO (usado pra orfaos,
// cuja pasta ja nao existe). flashcards/reviews/log caem em cascata.
router.delete('/api/maintenance/course/:course', async (req, res) => {
  const course = dec(req.params.course);
  try {
    const { deleted, total } = await wipeCourseFromDb(course, req.userId);
    res.json({ ok: true, course, deleted, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Admin ===

// POST /api/maintenance/rename-course { from, to } — renomeia a pasta na fonte
// E atualiza o course_title em todas as tabelas (mantem tudo atrelado).
router.post('/api/maintenance/rename-course', async (req, res) => {
  try {
    const from = String(req.body?.from || '').trim();
    const to = String(req.body?.to || '').trim();
    if (!from || !to) return res.status(400).json({ error: 'from e to obrigatorios' });
    if (from === to) return res.status(400).json({ error: 'o novo nome e igual ao atual' });
    if (/[\\/]/.test(to)) return res.status(400).json({ error: 'nome invalido (sem / ou \\)' });
    if (await sourceHasCourse(to)) return res.status(409).json({ error: `ja existe um curso chamado "${to}"` });

    const renamed = await renameSourceFolder(from, to);
    if (!renamed) return res.status(404).json({ error: `curso "${from}" nao encontrado na fonte` });

    const { updated, errors } = await renameCourseInDb(from, to, req.userId);
    res.json({ ok: true, from, to, updated, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/maintenance/delete-course/:course — apaga a PASTA na fonte (Drive
// ou disco) E tudo do banco. Irreversivel.
router.delete('/api/maintenance/delete-course/:course', async (req, res) => {
  const course = dec(req.params.course);
  try {
    let folderRemoved;
    try {
      folderRemoved = await deleteSourceFolder(course);
    } catch (e) {
      return res.status(500).json({ error: `falha ao apagar a pasta da fonte: ${e.message}` });
    }
    const { deleted, total } = await wipeCourseFromDb(course, req.userId);
    res.json({ ok: true, course, folderRemoved, deleted, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
