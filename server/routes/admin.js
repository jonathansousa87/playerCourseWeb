// Secao administrativa: aprovacao/gestao de usuarios. Todo o router exige
// role='admin' (ver requireAdmin em server/auth.js, montado em server.js).
import express from 'express';
import { requireAdmin } from '../auth.js';
import { query, pool } from '../../db/index.js';
import { buildDashboardStats, buildProfileStats, buildActivityBalance, buildRetentionBadges } from './stats.js';
import { getDueSummary } from '../flashcards.js';

const router = express.Router();

// Prefixo obrigatorio: router.use(fn) sem path, montado com app.use(adminRouter)
// (sem prefixo, server.js), vira catch-all pra QUALQUER request que chegue ate
// aqui na cadeia — nao so as rotas deste arquivo. Ver mesmo bug corrigido em
// server/routes/maintenance.js (bloqueava /api/me silenciosamente).
router.use('/api/admin', requireAdmin);

const ALLOWED_STATUS = new Set(['pending', 'approved', 'rejected', 'suspended']);
const ALLOWED_ROLE = new Set(['user', 'admin']);

// GET /api/admin/users — lista todo mundo que ja logou pelo menos uma vez
// (a linha em user_profiles e criada no primeiro request autenticado).
router.get('/api/admin/users', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT user_id, email, role, status, created_at FROM user_profiles ORDER BY created_at DESC',
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:userId { status?, role? } — aprova/rejeita/suspende
// ou promove/rebaixa. Nao deixa o admin mexer na propria conta (evita se
// suspender ou se rebaixar por engano e ficar trancado fora do painel).
router.patch('/api/admin/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { status, role } = req.body || {};

  if (userId === req.userId) {
    return res.status(400).json({ error: 'Nao e possivel alterar a propria conta' });
  }
  if (status !== undefined && !ALLOWED_STATUS.has(status)) {
    return res.status(400).json({ error: `status invalido (use: ${[...ALLOWED_STATUS].join(', ')})` });
  }
  if (role !== undefined && !ALLOWED_ROLE.has(role)) {
    return res.status(400).json({ error: `role invalido (use: ${[...ALLOWED_ROLE].join(', ')})` });
  }
  if (status === undefined && role === undefined) {
    return res.status(400).json({ error: 'informe status e/ou role' });
  }

  try {
    const { rows } = await query(
      `UPDATE user_profiles
       SET status = COALESCE($1, status), role = COALESCE($2, role), updated_at = NOW()
       WHERE user_id = $3
       RETURNING user_id, email, role, status, created_at`,
      [status ?? null, role ?? null, userId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario nao encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:userId/courses — titulos liberados pro usuario.
router.get('/api/admin/users/:userId/courses', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT course_title FROM course_access WHERE user_id = $1 ORDER BY course_title',
      [req.params.userId],
    );
    res.json(rows.map((r) => r.course_title));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:userId/courses { courseTitles: [...] } — substitui o
// set inteiro de cursos liberados pro usuario (mais simples que add/remove
// individual; a lista de cursos nao e gigante).
router.put('/api/admin/users/:userId/courses', async (req, res) => {
  const { userId } = req.params;
  const { courseTitles } = req.body || {};
  if (!Array.isArray(courseTitles) || courseTitles.some((t) => typeof t !== 'string')) {
    return res.status(400).json({ error: 'courseTitles deve ser um array de strings' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM course_access WHERE user_id = $1', [userId]);
    for (const title of courseTitles) {
      await client.query(
        'INSERT INTO course_access (user_id, course_title, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, title, req.userId],
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, courseTitles });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Progresso de outro usuario (leitura — nunca grava/revisa nada dele, so
// consulta). Reaproveita exatamente as mesmas queries que a propria conta usa
// no dashboard/revisao, so trocando req.userId por :userId do path.
router.get('/api/admin/users/:userId/dashboard', async (req, res) => {
  try {
    res.json(await buildDashboardStats(req.params.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/users/:userId/profile', async (req, res) => {
  try {
    res.json(await buildProfileStats(req.params.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/users/:userId/activity-balance', async (req, res) => {
  try {
    res.json(await buildActivityBalance(req.params.userId, req.query.days));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/users/:userId/retention-badges', async (req, res) => {
  try {
    res.json(await buildRetentionBadges(req.params.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/users/:userId/flashcards-summary', async (req, res) => {
  try {
    res.json(await getDueSummary({ userId: req.params.userId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
