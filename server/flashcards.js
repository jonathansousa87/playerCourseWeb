import { promises as fs } from 'fs';
import { join } from 'path';
import { fsrs, generatorParameters, Rating, createEmptyCard } from 'ts-fsrs';
import { query } from '../db/index.js';
import { parseAnkiFlashcards } from './flashcardParser.js';

export { parseAnkiFlashcards };

const params = generatorParameters({ enable_fuzz: true, enable_short_term: true });
const scheduler = fsrs(params);

// Converte estado persistido no DB para objeto Card esperado pelo ts-fsrs
const rowToCard = (row, now) => {
  if (!row) return createEmptyCard(now);
  return {
    due: row.due ? new Date(row.due) : now,
    stability: Number(row.stability) || 0,
    difficulty: Number(row.difficulty) || 0,
    elapsed_days: Number(row.elapsed_days) || 0,
    scheduled_days: Number(row.scheduled_days) || 0,
    reps: Number(row.reps) || 0,
    lapses: Number(row.lapses) || 0,
    state: Number(row.state) || 0,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
};

const findFlashcardFile = async (courseRoot, lessonPrefix) => {
  const matches = [];
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (
        e.name.startsWith(lessonPrefix) &&
        /_flashcards_anki(?:_dub)?_\d+(?:_ia)?\.txt$/i.test(e.name)
      ) {
        matches.push(full);
      }
    }
  };
  await walk(courseRoot);
  if (matches.length === 0) return null;
  const ia = matches.find((p) => /_ia\.txt$/i.test(p));
  return ia || matches[0];
};

// Importa (ou re-importa) o deck a partir do arquivo .txt
export const importDeck = async ({ coursesPath, courseTitle, lessonPrefix }) => {
  const courseRoot = join(coursesPath, courseTitle);
  const filePath = await findFlashcardFile(courseRoot, lessonPrefix);
  if (!filePath) {
    const err = new Error('arquivo de flashcards nao encontrado');
    err.code = 'NO_FLASHCARD_FILE';
    throw err;
  }
  const text = await fs.readFile(filePath, 'utf8');
  const cards = parseAnkiFlashcards(text);
  if (cards.length === 0) {
    const err = new Error('nenhum flashcard extraido');
    err.code = 'EMPTY_DECK';
    throw err;
  }

  // Upsert do deck
  const deckRes = await query(
    `INSERT INTO flashcard_decks (course_title, lesson_prefix, source_file)
     VALUES ($1, $2, $3)
     ON CONFLICT (course_title, lesson_prefix)
     DO UPDATE SET source_file = EXCLUDED.source_file, imported_at = NOW()
     RETURNING id`,
    [courseTitle, lessonPrefix, filePath],
  );
  const deckId = deckRes.rows[0].id;

  // Se ja havia cards, so inserimos os que faltam (match por front+back)
  const existing = await query(
    'SELECT id, front, back FROM flashcards WHERE deck_id = $1',
    [deckId],
  );
  const existingSet = new Set(
    existing.rows.map((r) => `${r.front}||${r.back}`),
  );

  let inserted = 0;
  for (const card of cards) {
    const key = `${card.front}||${card.back}`;
    if (existingSet.has(key)) continue;
    await query(
      `INSERT INTO flashcards (deck_id, front, back) VALUES ($1, $2, $3)`,
      [deckId, card.front, card.back],
    );
    inserted++;
  }

  return { deckId, total: cards.length, inserted };
};

export const getDeck = async ({ courseTitle, lessonPrefix }) => {
  const deckRes = await query(
    `SELECT id, imported_at FROM flashcard_decks
     WHERE course_title = $1 AND lesson_prefix = $2`,
    [courseTitle, lessonPrefix],
  );
  if (deckRes.rows.length === 0) return null;
  const deck = deckRes.rows[0];
  const cardsRes = await query(
    `SELECT c.id, c.front, c.back, c.tags, c.source_timestamp, c.difficulty_hint,
            r.state, r.due, r.reps, r.lapses, r.last_review, r.stability, r.difficulty
     FROM flashcards c
     LEFT JOIN flashcard_reviews r ON r.card_id = c.id
     WHERE c.deck_id = $1
     ORDER BY c.id`,
    [deck.id],
  );
  return {
    deckId: deck.id,
    importedAt: deck.imported_at,
    cards: cardsRes.rows,
  };
};

// Cards due de um curso (ou de todos os cursos se courseTitle === null)
export const getDueCards = async ({ courseTitle = null, limit = 50 } = {}) => {
  const now = new Date();
  const params = [now, limit];
  let where = '(r.due IS NULL OR r.due <= $1)';
  if (courseTitle) {
    params.push(courseTitle);
    where += ` AND d.course_title = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT c.id, c.front, c.back, c.tags, c.source_timestamp,
            d.course_title, d.lesson_prefix,
            COALESCE(r.state, 0) AS state,
            r.due, r.reps, r.lapses, r.stability, r.difficulty
     FROM flashcards c
     JOIN flashcard_decks d ON d.id = c.deck_id
     LEFT JOIN flashcard_reviews r ON r.card_id = c.id
     WHERE ${where}
     ORDER BY COALESCE(r.due, NOW() - INTERVAL '100 years') ASC
     LIMIT $2`,
    params,
  );
  return rows;
};

export const reviewCard = async ({ cardId, rating, confidence = null, now = new Date() }) => {
  const ratingMap = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy };
  const fsrsRating = ratingMap[rating];
  if (!fsrsRating) throw new Error('rating invalido (use 1..4)');
  if (confidence != null && !['high', 'medium', 'low'].includes(confidence)) {
    throw new Error('confidence invalido (use high|medium|low|null)');
  }

  const prev = await query(
    'SELECT * FROM flashcard_reviews WHERE card_id = $1',
    [cardId],
  );
  const card = rowToCard(prev.rows[0], now);
  const stateBefore = prev.rows[0]?.state ?? 0;

  const result = scheduler.next(card, now, fsrsRating);
  const c = result.card;
  const log = result.log;

  await query(
    `INSERT INTO flashcard_reviews
      (card_id, state, due, stability, difficulty, elapsed_days, scheduled_days,
       reps, lapses, last_review, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (card_id) DO UPDATE SET
       state = EXCLUDED.state,
       due = EXCLUDED.due,
       stability = EXCLUDED.stability,
       difficulty = EXCLUDED.difficulty,
       elapsed_days = EXCLUDED.elapsed_days,
       scheduled_days = EXCLUDED.scheduled_days,
       reps = EXCLUDED.reps,
       lapses = EXCLUDED.lapses,
       last_review = EXCLUDED.last_review,
       updated_at = NOW()`,
    [
      cardId,
      c.state,
      c.due,
      c.stability,
      c.difficulty,
      c.elapsed_days,
      c.scheduled_days,
      c.reps,
      c.lapses,
      c.last_review ?? now,
    ],
  );

  await query(
    `INSERT INTO flashcard_review_log
      (card_id, rating, state_before, state_after, elapsed_days, scheduled_days, stability, difficulty, confidence, reviewed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      cardId,
      rating,
      stateBefore,
      c.state,
      log.elapsed_days,
      log.scheduled_days,
      c.stability,
      c.difficulty,
      confidence,
      now,
    ],
  );

  return {
    cardId,
    state: c.state,
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduled_days,
  };
};

// Contadores rapidos (total / due) para badges na UI
export const getDueSummary = async () => {
  const now = new Date();
  const { rows } = await query(
    `SELECT d.course_title,
            COUNT(*)::int AS total,
            SUM(CASE WHEN r.due IS NULL OR r.due <= $1 THEN 1 ELSE 0 END)::int AS due
     FROM flashcards c
     JOIN flashcard_decks d ON d.id = c.deck_id
     LEFT JOIN flashcard_reviews r ON r.card_id = c.id
     GROUP BY d.course_title`,
    [now],
  );
  return rows;
};
