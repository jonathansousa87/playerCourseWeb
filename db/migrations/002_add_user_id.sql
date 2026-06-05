-- Etapa 1 — adiciona coluna user_id (UUID) NULLABLE em todas as tabelas com
-- dados de usuario. FK aponta para auth.users do Supabase Auth.
-- Nullable inicialmente: codigo legado continua inserindo sem user_id ate a
-- Etapa 6 (refactor de queries). Etapa 3 converte para NOT NULL apos backfill.
-- Idempotente via ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

ALTER TABLE lesson_progress
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE step_completions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE personal_notes
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE pomodoro_sessions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE weekly_diaries
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE flashcard_decks
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE flashcards
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE flashcard_reviews
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE flashcard_review_log
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE lesson_chats
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE prequestion_attempts
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE view_sessions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE technical_diary_notes
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indices compostos para queries quentes (sempre filtra por user_id em
-- conjunto com curso/aula/data). RLS gera filtros adicionais por user_id em
-- todas as queries vindas do cliente direto, entao indice helper.
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_course
    ON lesson_progress (user_id, course_title);
CREATE INDEX IF NOT EXISTS idx_step_completions_user_course
    ON step_completions (user_id, course_title);
CREATE INDEX IF NOT EXISTS idx_personal_notes_user
    ON personal_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user_date
    ON pomodoro_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_diaries_user
    ON weekly_diaries (user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_course
    ON flashcard_decks (user_id, course_title);
CREATE INDEX IF NOT EXISTS idx_flashcards_user
    ON flashcards (user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_due
    ON flashcard_reviews (user_id, due);
CREATE INDEX IF NOT EXISTS idx_flashcard_review_log_user_date
    ON flashcard_review_log (user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_lesson
    ON quiz_attempts (user_id, course_title, lesson_prefix);
CREATE INDEX IF NOT EXISTS idx_lesson_chats_user_lesson
    ON lesson_chats (user_id, course_title, lesson_prefix);
CREATE INDEX IF NOT EXISTS idx_prequestion_attempts_user_lesson
    ON prequestion_attempts (user_id, course_title, lesson_prefix);
CREATE INDEX IF NOT EXISTS idx_view_sessions_user_kind_date
    ON view_sessions (user_id, kind, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_technical_diary_notes_user
    ON technical_diary_notes (user_id);
