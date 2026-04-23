import express from 'express';
import { query, ensureReady } from '../../db/index.js';

const router = express.Router();
const dec = (s) => decodeURIComponent(s);

// Health do DB — usado pelo frontend pra sinalizar quando Postgres cai.
router.get('/api/db/health', async (_req, res) => {
  const ok = await ensureReady();
  res.status(ok ? 200 : 503).json({ ok });
});

// Snapshot de TODOS os cursos — usado na home.
router.get('/api/progress/all', async (_req, res) => {
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

// Lesson progress (aulas concluidas).
router.get('/api/progress/:courseTitle/lessons', async (req, res) => {
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

router.post('/api/progress/:courseTitle/lessons', async (req, res) => {
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

router.delete('/api/progress/:courseTitle/lessons', async (req, res) => {
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

// Step completions (etapas dentro da aula).
router.get('/api/progress/:courseTitle/steps', async (req, res) => {
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

router.post('/api/progress/:courseTitle/steps', async (req, res) => {
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

router.delete('/api/progress/:courseTitle/steps', async (req, res) => {
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

// === Notas no DB (personal, pomodoro, diary, diary-tecnico) ===

router.get('/api/db/notes/:courseTitle/pessoal/:lessonPrefix', async (req, res) => {
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

router.post('/api/db/notes/:courseTitle/pessoal', async (req, res) => {
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

router.get('/api/db/notes/:courseTitle/pomodoro', async (req, res) => {
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

router.post('/api/db/notes/:courseTitle/pomodoro', async (req, res) => {
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

router.get('/api/db/diary/:courseTitle', async (req, res) => {
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

router.post('/api/db/diary/:courseTitle', async (req, res) => {
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

router.get('/api/db/diary-tecnico/:courseTitle/:lessonPrefix', async (req, res) => {
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

router.post('/api/db/diary-tecnico/:courseTitle/:lessonPrefix', async (req, res) => {
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

// Migracao one-shot do localStorage legacy para Postgres.
router.post('/api/migrate-localstorage', async (req, res) => {
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

export default router;
