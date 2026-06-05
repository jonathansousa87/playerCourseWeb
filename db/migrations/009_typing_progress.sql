-- Curso de digitacao (touch typing) — progresso por usuario.
-- Uma linha por (usuario, licao). Guarda o recorde de WPM/precisao e marca
-- a licao como concluida quando a precisao atinge o limiar (>=95%).
-- Roda em transacao propria pelo migrate-versioned (sem BEGIN/COMMIT aqui).

CREATE TABLE IF NOT EXISTS typing_progress (
  id            BIGSERIAL    PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id     TEXT         NOT NULL,
  best_wpm      INTEGER      NOT NULL DEFAULT 0,
  best_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
  attempts      INTEGER      NOT NULL DEFAULT 0,
  completed     BOOLEAN      NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_typing_progress_user
  ON typing_progress (user_id);

ALTER TABLE typing_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS typing_progress_owner_select ON typing_progress;
DROP POLICY IF EXISTS typing_progress_owner_insert ON typing_progress;
DROP POLICY IF EXISTS typing_progress_owner_update ON typing_progress;
DROP POLICY IF EXISTS typing_progress_owner_delete ON typing_progress;

CREATE POLICY typing_progress_owner_select ON typing_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY typing_progress_owner_insert ON typing_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY typing_progress_owner_update ON typing_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY typing_progress_owner_delete ON typing_progress
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
