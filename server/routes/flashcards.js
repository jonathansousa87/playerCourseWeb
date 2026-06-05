import express from 'express';
import { query } from '../../db/index.js';
import {
  importDeck,
  getDeck,
  getDueCards,
  reviewCard,
  getDueSummary,
} from '../flashcards.js';
import { findConfusionGroups } from '../semanticConfusion.js';
import { getCoursesPath } from '../config.js';

const router = express.Router();
const dec = (s) => decodeURIComponent(s);

// Importa o deck a partir do arquivo .txt da aula
router.post('/api/flashcards/:courseTitle/:lessonPrefix/import', async (req, res) => {
  try {
    const result = await importDeck({
      userId: req.userId,
      coursesPath: getCoursesPath(),
      courseTitle: dec(req.params.courseTitle),
      lessonPrefix: dec(req.params.lessonPrefix),
    });
    res.json(result);
  } catch (err) {
    const code = err.code === 'NO_FLASHCARD_FILE' ? 404 : 500;
    res.status(code).json({ error: err.message });
  }
});

// Cards vencidos. Declarar antes da rota /:courseTitle/:lessonPrefix pra nao
// cair no matcher generico.
router.get('/api/flashcards/due', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const courseTitle = req.query.courseTitle ? dec(req.query.courseTitle) : null;
    const cards = await getDueCards({ userId: req.userId, courseTitle, limit });
    res.json({ count: cards.length, cards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/flashcards/summary', async (req, res) => {
  try {
    const rows = await getDueSummary({ userId: req.userId });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Grupos de cards com fronts similares (confusao semantica)
router.get('/api/flashcards/confusion', async (req, res) => {
  try {
    const courseTitle = req.query.courseTitle || null;
    const minLapses = Math.max(1, Number(req.query.minLapses) || 2);
    const threshold = Math.min(0.99, Math.max(0.1, Number(req.query.threshold) || 0.4));

    const params = [minLapses, req.userId];
    let where = 'COALESCE(r.lapses, 0) >= $1 AND d.user_id = $2';
    if (courseTitle) {
      params.push(courseTitle);
      where += ` AND d.course_title = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT c.id, c.front, c.back, COALESCE(r.lapses, 0)::int AS lapses,
              COALESCE(r.reps, 0)::int AS reps,
              d.course_title, d.lesson_prefix
       FROM flashcards c
       JOIN flashcard_decks d ON d.id = c.deck_id
       LEFT JOIN flashcard_reviews r ON r.card_id = c.id
       WHERE ${where}`,
      params,
    );

    const groups = findConfusionGroups(rows, { threshold, minLapses });
    res.json({
      threshold,
      minLapses,
      groups: groups.map((g) => ({
        totalLapses: g.totalLapses,
        cards: g.cards.map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
          lapses: c.lapses,
          reps: c.reps,
          courseTitle: c.course_title,
          lessonPrefix: c.lesson_prefix,
        })),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Review de um card (rating 1..4 + confidence opcional)
router.post('/api/flashcards/review/:cardId', async (req, res) => {
  try {
    const cardId = Number(req.params.cardId);
    if (!Number.isFinite(cardId)) return res.status(400).json({ error: 'cardId invalido' });
    const rating = Number(req.body?.rating);
    const confidence = req.body?.confidence || null;
    const result = await reviewCard({ userId: req.userId, cardId, rating, confidence });
    res.json(result);
  } catch (err) {
    const code = err.code === 'CARD_NOT_FOUND' ? 404 : 400;
    res.status(code).json({ error: err.message });
  }
});

// Cards com hypercorrection: confianca='high' + rating <= 2 nas ultimas
// reviews. Esses sao os mais valiosos pra revisar (Metcalfe 2017).
router.get('/api/flashcards/hypercorrection', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const { rows } = await query(
      `SELECT c.id, c.front, c.back, d.course_title, d.lesson_prefix,
              COUNT(*) FILTER (WHERE l.confidence = 'high' AND l.rating <= 2)::int AS surprise_errors,
              COUNT(*) FILTER (WHERE l.confidence = 'high')::int AS high_conf_attempts,
              MAX(l.reviewed_at) FILTER (WHERE l.confidence = 'high' AND l.rating <= 2) AS last_surprise,
              COALESCE(r.lapses, 0)::int AS total_lapses,
              COALESCE(r.reps, 0)::int AS total_reps
       FROM flashcards c
       JOIN flashcard_decks d ON d.id = c.deck_id
       LEFT JOIN flashcard_reviews r ON r.card_id = c.id
       JOIN flashcard_review_log l ON l.card_id = c.id
       WHERE c.user_id = $3
         AND l.reviewed_at >= NOW() - $1::interval
       GROUP BY c.id, c.front, c.back, d.course_title, d.lesson_prefix, r.lapses, r.reps
       HAVING COUNT(*) FILTER (WHERE l.confidence = 'high' AND l.rating <= 2) > 0
       ORDER BY surprise_errors DESC, last_surprise DESC
       LIMIT $2`,
      [`${days} days`, limit, req.userId],
    );
    res.json({ days, count: rows.length, cards: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista cards + estado FSRS do deck. Vem por ultimo pra nao colidir com as
// rotas fixas acima (/due, /summary, /confusion, /review).
router.get('/api/flashcards/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const deck = await getDeck({
      userId: req.userId,
      courseTitle: dec(req.params.courseTitle),
      lessonPrefix: dec(req.params.lessonPrefix),
    });
    if (!deck) return res.status(404).json({ error: 'deck nao importado' });
    res.json(deck);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
