// Progresso do curso de digitacao (touch typing). Escopado por usuario.
// O conteudo das licoes vive no frontend (src/typing/curriculum.js) — aqui so
// guardamos resultado: recorde de WPM/precisao, tentativas e conclusao.
import express from 'express';
import { query } from '../../db/index.js';

const router = express.Router();

// Limiar de precisao (%) para considerar a licao concluida. Boa pratica de
// touch typing: precisao primeiro, velocidade vem depois.
const PASS_ACCURACY = 95;

// GET /api/typing/progress — mapa { [lessonId]: {...} } do usuario logado.
router.get('/api/typing/progress', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT lesson_id, best_wpm, best_accuracy, attempts, completed, completed_at
       FROM typing_progress WHERE user_id = $1`,
      [req.userId],
    );
    const out = {};
    for (const r of rows) {
      out[r.lesson_id] = {
        bestWpm: r.best_wpm,
        bestAccuracy: Number(r.best_accuracy),
        attempts: r.attempts,
        completed: r.completed,
        completedAt: r.completed_at,
      };
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/typing/progress — registra uma tentativa de uma licao.
// Body: { lessonId, wpm, accuracy }. Mantem o recorde (maior WPM/precisao),
// incrementa tentativas e marca como concluida quando precisao >= PASS_ACCURACY.
router.post('/api/typing/progress', async (req, res) => {
  try {
    const { lessonId, wpm, accuracy } = req.body || {};
    if (!lessonId || typeof lessonId !== 'string') {
      return res.status(400).json({ error: 'lessonId obrigatorio' });
    }
    const wpmInt = Math.max(0, Math.round(Number(wpm) || 0));
    const accNum = Math.min(100, Math.max(0, Number(accuracy) || 0));
    const passedNow = accNum >= PASS_ACCURACY;

    const { rows } = await query(
      `INSERT INTO typing_progress
         (user_id, lesson_id, best_wpm, best_accuracy, attempts, completed, completed_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, $5, CASE WHEN $5 THEN NOW() END, NOW())
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         best_wpm      = GREATEST(typing_progress.best_wpm, EXCLUDED.best_wpm),
         best_accuracy = GREATEST(typing_progress.best_accuracy, EXCLUDED.best_accuracy),
         attempts      = typing_progress.attempts + 1,
         completed     = typing_progress.completed OR EXCLUDED.completed,
         completed_at  = COALESCE(typing_progress.completed_at, EXCLUDED.completed_at),
         updated_at    = NOW()
       RETURNING best_wpm, best_accuracy, attempts, completed, completed_at`,
      [req.userId, lessonId, wpmInt, accNum, passedNow],
    );

    const r = rows[0];
    res.json({
      passed: passedNow,
      passAccuracy: PASS_ACCURACY,
      lesson: {
        bestWpm: r.best_wpm,
        bestAccuracy: Number(r.best_accuracy),
        attempts: r.attempts,
        completed: r.completed,
        completedAt: r.completed_at,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
