-- Etapa 3 — apos o backfill (003), fixa user_id como NOT NULL em todas as 14
-- tabelas com dados de usuario, e troca os UNIQUE compostos por versoes que
-- escopam por usuario (mesmo curso/aula em usuarios diferentes nao colide).
-- Idempotente: SET NOT NULL e DROP CONSTRAINT IF EXISTS sao safe; ADD
-- CONSTRAINT envolvido em DO block que checa pg_constraint.

ALTER TABLE lesson_progress       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE step_completions      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE personal_notes        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE pomodoro_sessions     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE weekly_diaries        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE flashcard_decks       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE flashcards            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE flashcard_reviews     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE flashcard_review_log  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE quiz_attempts         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE lesson_chats          ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE prequestion_attempts  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE view_sessions         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE technical_diary_notes ALTER COLUMN user_id SET NOT NULL;

-- ── Trocar UNIQUEs antigas pelas novas (escopadas por user_id) ────────────

-- lesson_progress: UNIQUE (course_title, lesson_path) -> (user_id, ...)
ALTER TABLE lesson_progress
    DROP CONSTRAINT IF EXISTS lesson_progress_course_title_lesson_path_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_progress_user_course_lesson_uniq') THEN
    ALTER TABLE lesson_progress
      ADD CONSTRAINT lesson_progress_user_course_lesson_uniq
      UNIQUE (user_id, course_title, lesson_path);
  END IF;
END $$;

-- step_completions: UNIQUE (course_title, lesson_prefix, step_key) -> +user_id
ALTER TABLE step_completions
    DROP CONSTRAINT IF EXISTS step_completions_course_title_lesson_prefix_step_key_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'step_completions_user_course_lesson_step_uniq') THEN
    ALTER TABLE step_completions
      ADD CONSTRAINT step_completions_user_course_lesson_step_uniq
      UNIQUE (user_id, course_title, lesson_prefix, step_key);
  END IF;
END $$;

-- personal_notes: UNIQUE (course_title, lesson_prefix) -> +user_id
ALTER TABLE personal_notes
    DROP CONSTRAINT IF EXISTS personal_notes_course_title_lesson_prefix_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_notes_user_course_lesson_uniq') THEN
    ALTER TABLE personal_notes
      ADD CONSTRAINT personal_notes_user_course_lesson_uniq
      UNIQUE (user_id, course_title, lesson_prefix);
  END IF;
END $$;

-- weekly_diaries: UNIQUE (course_title, week_key) -> +user_id
ALTER TABLE weekly_diaries
    DROP CONSTRAINT IF EXISTS weekly_diaries_course_title_week_key_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_diaries_user_course_week_uniq') THEN
    ALTER TABLE weekly_diaries
      ADD CONSTRAINT weekly_diaries_user_course_week_uniq
      UNIQUE (user_id, course_title, week_key);
  END IF;
END $$;

-- flashcard_decks: UNIQUE (course_title, lesson_prefix) -> +user_id
ALTER TABLE flashcard_decks
    DROP CONSTRAINT IF EXISTS flashcard_decks_course_title_lesson_prefix_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flashcard_decks_user_course_lesson_uniq') THEN
    ALTER TABLE flashcard_decks
      ADD CONSTRAINT flashcard_decks_user_course_lesson_uniq
      UNIQUE (user_id, course_title, lesson_prefix);
  END IF;
END $$;

-- technical_diary_notes: UNIQUE (course_title, lesson_prefix) -> +user_id
ALTER TABLE technical_diary_notes
    DROP CONSTRAINT IF EXISTS technical_diary_notes_course_title_lesson_prefix_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'technical_diary_notes_user_course_lesson_uniq') THEN
    ALTER TABLE technical_diary_notes
      ADD CONSTRAINT technical_diary_notes_user_course_lesson_uniq
      UNIQUE (user_id, course_title, lesson_prefix);
  END IF;
END $$;
