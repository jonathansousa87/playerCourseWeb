import express from 'express';
import { query } from '../../db/index.js';

const router = express.Router();

// Acerto em 7 dias — alimenta o Pomodoro adaptativo.
router.get('/api/stats/recent', async (_req, res) => {
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

// Dashboard: heatmap 90d + retencao 7d/30d + top lapsos + backlog ETA.
router.get('/api/stats/dashboard', async (_req, res) => {
  try {
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

// Perfil cognitivo: hora otima/fraca, streak, drift D, totais.
router.get('/api/stats/profile', async (_req, res) => {
  try {
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
      let start = new Date(today);
      if (!daySet.has(start.toISOString().slice(0, 10))) {
        start.setUTCDate(start.getUTCDate() - 1);
      }
      while (daySet.has(start.toISOString().slice(0, 10))) {
        streak++;
        start.setUTCDate(start.getUTCDate() - 1);
      }
    }

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

// Acerto por aula dentro de um curso — badges/banner do ModuleItem.
router.get('/api/stats/lesson-accuracy/:courseTitle', async (req, res) => {
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

export default router;
