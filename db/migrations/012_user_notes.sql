-- Bloco de notas global do usuario (scratchpad): UM por usuario, visivel em
-- toda a pipeline da aula. Sincroniza entre maquinas via banco.

CREATE TABLE IF NOT EXISTS user_notes (
  user_id    UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notes_owner_select ON user_notes;
DROP POLICY IF EXISTS user_notes_owner_insert ON user_notes;
DROP POLICY IF EXISTS user_notes_owner_update ON user_notes;
DROP POLICY IF EXISTS user_notes_owner_delete ON user_notes;

CREATE POLICY user_notes_owner_select ON user_notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_notes_owner_insert ON user_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_notes_owner_update ON user_notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_notes_owner_delete ON user_notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
