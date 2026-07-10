import express from 'express';
import { query } from '../../db/index.js';

const router = express.Router();

// Acerto em 7 dias — alimenta o Pomodoro adaptativo.
router.get('/api/stats/recent', async (req, res) => {
  try {
    const acc = await query(
      `SELECT
         COUNT(*)::int AS n,
         SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END)::int AS hits
       FROM flashcard_review_log
       WHERE user_id = $1 AND reviewed_at >= NOW() - INTERVAL '7 days'`,
      [req.userId],
    );
    const row = acc.rows[0] || { n: 0, hits: 0 };
    const accuracy7d = row.n > 0 ? row.hits / row.n : null;
    res.json({ accuracy7d, reviews7d: row.n });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard: heatmap 90d + retencao 7d/30d + top lapsos + backlog ETA.
// userId de parametro (nao req.userId) pra reaproveitar nas rotas admin de
// "ver progresso de outro usuario" (server/routes/admin.js).
export const buildDashboardStats = async (userId) => {
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
         WHERE user_id = $1 AND reviewed_at >= CURRENT_DATE - INTERVAL '89 days'
         GROUP BY 1
       ),
       pomos AS (
         SELECT created_at::date AS day, COUNT(*)::int AS n
         FROM pomodoro_sessions
         WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '89 days'
         GROUP BY 1
       )
       SELECT d.day,
              COALESCE(r.n, 0) AS reviews,
              COALESCE(p.n, 0) AS pomodoros
       FROM days d
       LEFT JOIN reviews r ON r.day = d.day
       LEFT JOIN pomos p ON p.day = d.day
       ORDER BY d.day`,
      [userId],
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
       WHERE rl.user_id = $1
         AND rl.reviewed_at >= NOW() - INTERVAL '30 days'
       GROUP BY d.course_title
       ORDER BY n_30d DESC`,
      [userId],
    );

    const topLapses = await query(
      `SELECT c.id, c.front, d.course_title, d.lesson_prefix,
              r.lapses, r.reps
       FROM flashcards c
       JOIN flashcard_decks d ON d.id = c.deck_id
       JOIN flashcard_reviews r ON r.card_id = c.id
       WHERE c.user_id = $1 AND r.lapses >= 1
       ORDER BY r.lapses DESC, r.reps DESC
       LIMIT 10`,
      [userId],
    );

    const backlogRes = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM flashcard_reviews r WHERE r.user_id = $1 AND r.due <= NOW()) +
         (SELECT COUNT(*)::int FROM flashcards c WHERE c.user_id = $1 AND NOT EXISTS (
            SELECT 1 FROM flashcard_reviews fr WHERE fr.card_id = c.id
         )) AS due_cards,
         (SELECT COUNT(*)::numeric FROM flashcard_review_log
          WHERE user_id = $1 AND reviewed_at >= NOW() - INTERVAL '14 days') / 14.0 AS avg_per_day`,
      [userId],
    );
    const b = backlogRes.rows[0] || {};
    const avgPerDay = Number(b.avg_per_day) || 0;
    const dueCards = Number(b.due_cards) || 0;
    const etaDays = avgPerDay > 0 ? Math.ceil(dueCards / avgPerDay) : null;

    return {
      heatmap: heatmap.rows,
      retention: retention.rows,
      topLapses: topLapses.rows,
      backlog: { dueCards, avgPerDay: Number(avgPerDay.toFixed(2)), etaDays },
    };
};

router.get('/api/stats/dashboard', async (req, res) => {
  try {
    res.json(await buildDashboardStats(req.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Perfil cognitivo: hora otima/fraca, streak, drift D, totais.
export const buildProfileStats = async (userId) => {
    const hours = await query(
      `SELECT EXTRACT(HOUR FROM reviewed_at)::int AS hr,
              COUNT(*)::int AS n,
              SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END)::int AS hits
       FROM flashcard_review_log
       WHERE user_id = $1 AND reviewed_at >= NOW() - INTERVAL '30 days'
       GROUP BY hr
       HAVING COUNT(*) >= 5
       ORDER BY hr`,
      [userId],
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
       WHERE user_id = $1 AND reviewed_at >= CURRENT_DATE - INTERVAL '365 days'
       ORDER BY day DESC`,
      [userId],
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
       WHERE user_id = $1 AND reviewed_at >= NOW() - INTERVAL '30 days' AND difficulty IS NOT NULL`,
      [userId],
    );
    const dRecent = drift.rows[0]?.d_recent != null ? Number(drift.rows[0].d_recent) : null;
    const dPrev = drift.rows[0]?.d_prev != null ? Number(drift.rows[0].d_prev) : null;
    const difficultyDrift =
      dRecent != null && dPrev != null ? Number((dRecent - dPrev).toFixed(3)) : null;

    const totals = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM flashcards WHERE user_id = $1) AS total_cards,
         (SELECT COUNT(*)::int FROM flashcard_review_log WHERE user_id = $1) AS total_reviews,
         (SELECT COUNT(*)::int FROM flashcard_reviews WHERE user_id = $1 AND state >= 2) AS mature_cards`,
      [userId],
    );
    const t = totals.rows[0] || { total_cards: 0, total_reviews: 0, mature_cards: 0 };

    return {
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
    };
};

router.get('/api/stats/profile', async (req, res) => {
  try {
    res.json(await buildProfileStats(req.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const SECS = {
  flashcardReview: 10,
  quizQuestion: 30,
  prequizQuestion: 25,
  videoStep: 8 * 60,
  resumoStep: 4 * 60,
  exemplosStep: 6 * 60,
};

router.post('/api/stats/view-session', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix, kind, seconds } = req.body || {};
    if (!courseTitle || !lessonPrefix || !kind) {
      return res.status(400).json({ error: 'courseTitle, lessonPrefix, kind obrigatorios' });
    }
    if (!['video', 'resumo', 'exemplos'].includes(kind)) {
      return res.status(400).json({ error: 'kind invalido' });
    }
    const secs = Math.floor(Number(seconds) || 0);
    if (secs < 5) {
      return res.json({ saved: false, reason: 'too-short' });
    }
    const capped = Math.min(secs, 4 * 60 * 60);
    await query(
      `INSERT INTO view_sessions (user_id, course_title, lesson_prefix, kind, seconds)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.userId, courseTitle, lessonPrefix, kind, capped],
    );
    res.json({ saved: true, seconds: capped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export const buildActivityBalance = async (userId, rawDays = 30) => {
    const days = Math.max(1, Math.min(365, Number(rawDays) || 30));
    const interval = `${days} days`;

    const reviews = await query(
      `SELECT COUNT(*)::int AS n
       FROM flashcard_review_log
       WHERE user_id = $1 AND reviewed_at >= NOW() - $2::interval`,
      [userId, interval],
    );
    const quizzes = await query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::int AS questions
       FROM quiz_attempts
       WHERE user_id = $1 AND answered_at >= NOW() - $2::interval`,
      [userId, interval],
    );
    const prequiz = await query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::int AS questions
       FROM prequestion_attempts
       WHERE user_id = $1 AND attempted_at >= NOW() - $2::interval`,
      [userId, interval],
    );

    const tracked = await query(
      `SELECT kind, COUNT(*)::int AS sessions, COALESCE(SUM(seconds), 0)::int AS total_seconds
       FROM view_sessions
       WHERE user_id = $1 AND started_at >= NOW() - $2::interval
       GROUP BY kind`,
      [userId, interval],
    );
    const trackedByKind = { video: null, resumo: null, exemplos: null };
    for (const row of tracked.rows) {
      trackedByKind[row.kind] = { sessions: row.sessions, seconds: row.total_seconds };
    }

    const passiveSteps = await query(
      `SELECT step_key, COUNT(*)::int AS n
       FROM step_completions
       WHERE user_id = $1
         AND step_key IN ('video', 'resumo', 'exemplos')
         AND completed_at >= NOW() - $2::interval
       GROUP BY step_key`,
      [userId, interval],
    );
    const stepCounts = { video: 0, resumo: 0, exemplos: 0 };
    for (const row of passiveSteps.rows) stepCounts[row.step_key] = row.n;

    const activeBreakdown = {
      flashcards: {
        count: reviews.rows[0].n,
        seconds: reviews.rows[0].n * SECS.flashcardReview,
      },
      quiz: {
        count: quizzes.rows[0].n,
        questions: quizzes.rows[0].questions,
        seconds: quizzes.rows[0].questions * SECS.quizQuestion,
      },
      prequiz: {
        count: prequiz.rows[0].n,
        questions: prequiz.rows[0].questions,
        seconds: prequiz.rows[0].questions * SECS.prequizQuestion,
      },
    };
    const activeSeconds =
      activeBreakdown.flashcards.seconds +
      activeBreakdown.quiz.seconds +
      activeBreakdown.prequiz.seconds;

    const buildPassiveEntry = (kind, fallbackPerStep) => {
      if (trackedByKind[kind]) {
        return {
          count: trackedByKind[kind].sessions,
          seconds: trackedByKind[kind].seconds,
          source: 'tracked',
        };
      }
      return {
        count: stepCounts[kind],
        seconds: stepCounts[kind] * fallbackPerStep,
        source: 'estimated',
      };
    };

    const passiveBreakdown = {
      video: buildPassiveEntry('video', SECS.videoStep),
      resumo: buildPassiveEntry('resumo', SECS.resumoStep),
      exemplos: buildPassiveEntry('exemplos', SECS.exemplosStep),
    };
    const passiveSeconds =
      passiveBreakdown.video.seconds +
      passiveBreakdown.resumo.seconds +
      passiveBreakdown.exemplos.seconds;
    const allTracked = Object.values(passiveBreakdown).every((v) => v.source === 'tracked' || v.count === 0);
    const passiveSource = allTracked ? 'tracked' : 'mixed';

    const ratio = passiveSeconds > 0 ? activeSeconds / passiveSeconds : null;

    let recommendation;
    let level;
    if (activeSeconds === 0 && passiveSeconds === 0) {
      level = 'no-data';
      recommendation = 'Sem atividade nos ultimos dias — comece por uma aula ou revisao.';
    } else if (passiveSeconds === 0) {
      level = 'good';
      recommendation = 'So testando, sem consumo passivo. Otimo pra retencao, mas nao deixe de estudar conteudo novo.';
    } else if (ratio >= 1) {
      level = 'good';
      recommendation = `Razao ${ratio.toFixed(1)}:1 (recall:leitura). Voce esta testando mais que consumindo — ideal pra fixar.`;
    } else if (ratio >= 0.5) {
      level = 'ok';
      recommendation = `Razao ${ratio.toFixed(1)}:1. OK, mas tente subir pra ~1:1 — fluencia (ler) nao eh aprendizado.`;
    } else if (ratio >= 0.25) {
      level = 'warning';
      recommendation = `Razao ${ratio.toFixed(1)}:1. Voce esta consumindo ${Math.round(1 / ratio)}x mais que testando. Agende mais revisoes/quiz.`;
    } else {
      level = 'bad';
      recommendation = `Razao ${ratio.toFixed(2)}:1. Quase so consumo passivo. Cards e quiz precisam virar prioridade — fluencia ≠ aprendizado.`;
    }

    return {
      days,
      active: {
        totalSeconds: activeSeconds,
        totalMinutes: Math.round(activeSeconds / 60),
        breakdown: activeBreakdown,
      },
      passive: {
        totalSeconds: passiveSeconds,
        totalMinutes: Math.round(passiveSeconds / 60),
        breakdown: passiveBreakdown,
        source: passiveSource,
      },
      ratio: ratio != null ? Number(ratio.toFixed(3)) : null,
      level,
      recommendation,
      assumedSeconds: SECS,
    };
};

router.get('/api/stats/activity-balance', async (req, res) => {
  try {
    res.json(await buildActivityBalance(req.userId, req.query.days));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const BADGE_TIERS = [
  { key: '1w', days: 7, label: '1 semana' },
  { key: '1m', days: 30, label: '1 mes' },
  { key: '3m', days: 90, label: '3 meses' },
  { key: '6m', days: 180, label: '6 meses' },
  { key: '1y', days: 365, label: '1 ano' },
  { key: '2y', days: 730, label: '2 anos' },
];

export const buildRetentionBadges = async (userId) => {
    const { rows: cards } = await query(
      `SELECT c.id, c.front, d.course_title, d.lesson_prefix,
              cf.first_review,
              EXTRACT(EPOCH FROM (NOW() - cf.first_review)) / 86400 AS age_days,
              fr.lapses, fr.reps
       FROM flashcards c
       JOIN flashcard_decks d ON d.id = c.deck_id
       JOIN flashcard_reviews fr ON fr.card_id = c.id AND fr.state = 2
       JOIN (
         SELECT card_id, MIN(reviewed_at) AS first_review
         FROM flashcard_review_log
         WHERE user_id = $1
         GROUP BY card_id
       ) cf ON cf.card_id = c.id
       WHERE c.user_id = $1`,
      [userId],
    );

    const byTier = BADGE_TIERS.map((t) => ({
      key: t.key,
      label: t.label,
      thresholdDays: t.days,
      count: cards.filter((c) => Number(c.age_days) >= t.days).length,
    }));

    const milestones = [];
    for (const t of BADGE_TIERS) {
      for (const c of cards) {
        const age = Number(c.age_days);
        if (age >= t.days && age < t.days + 7) {
          milestones.push({
            cardId: c.id,
            front: c.front,
            courseTitle: c.course_title,
            lessonPrefix: c.lesson_prefix,
            tier: t.key,
            tierLabel: t.label,
            firstReview: c.first_review,
            ageDays: Math.floor(age),
          });
        }
      }
    }
    milestones.sort((a, b) => b.ageDays - a.ageDays);

    return {
      tiers: byTier,
      recentMilestones: milestones.slice(0, 20),
      totalMature: cards.length,
    };
};

router.get('/api/stats/retention-badges', async (req, res) => {
  try {
    res.json(await buildRetentionBadges(req.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
       WHERE l.user_id = $1
         AND d.course_title = $2
         AND l.reviewed_at >= NOW() - ($3::int || ' days')::interval
       GROUP BY d.lesson_prefix`,
      [req.userId, courseTitle, days],
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
