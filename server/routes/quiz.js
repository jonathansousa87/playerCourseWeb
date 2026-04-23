import express from 'express';
import { query } from '../../db/index.js';

const router = express.Router();

router.post('/api/quiz/:courseTitle/:lessonPrefix/attempts', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const score = Number(req.body?.score);
    const total = Number(req.body?.total);
    if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'score/total invalidos' });
    }
    const { rows } = await query(
      `INSERT INTO quiz_attempts (course_title, lesson_prefix, score, total)
       VALUES ($1,$2,$3,$4)
       RETURNING id, score, total, answered_at`,
      [courseTitle, lessonPrefix, score, total],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/quiz/:courseTitle/:lessonPrefix/attempts', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const { rows } = await query(
      `SELECT id, score, total, answered_at
       FROM quiz_attempts
       WHERE course_title = $1 AND lesson_prefix = $2
       ORDER BY answered_at DESC
       LIMIT 20`,
      [courseTitle, lessonPrefix],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Converte questoes erradas em flashcards no deck da aula.
router.post('/api/quiz/:courseTitle/:lessonPrefix/wrong-to-flashcards', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const valid = items
      .map((i) => ({
        front: String(i?.front || '').trim(),
        back: String(i?.back || '').trim(),
      }))
      .filter((i) => i.front && i.back);

    if (valid.length === 0) {
      return res.status(400).json({ error: 'items vazios ou invalidos' });
    }

    const deckRes = await query(
      `INSERT INTO flashcard_decks (course_title, lesson_prefix, source_file)
       VALUES ($1, $2, NULL)
       ON CONFLICT (course_title, lesson_prefix)
       DO UPDATE SET imported_at = flashcard_decks.imported_at
       RETURNING id`,
      [courseTitle, lessonPrefix],
    );
    const deckId = deckRes.rows[0].id;

    const existing = await query(
      'SELECT front, back FROM flashcards WHERE deck_id = $1',
      [deckId],
    );
    const existingSet = new Set(
      existing.rows.map((r) => `${r.front}||${r.back}`),
    );

    let inserted = 0;
    for (const item of valid) {
      const key = `${item.front}||${item.back}`;
      if (existingSet.has(key)) continue;
      await query(
        `INSERT INTO flashcards (deck_id, front, back, card_type, tags)
         VALUES ($1, $2, $3, 'quiz_wrong', ARRAY['quiz'])`,
        [deckId, item.front, item.back],
      );
      inserted++;
    }

    res.json({ deckId, received: valid.length, inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
