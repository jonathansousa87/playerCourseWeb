-- Configuracoes da plataforma por usuario.
-- Substitui credenciais hardcoded no .env do mobile (Drive, DeepSeek, etc).
-- Cada usuario configura suas proprias credenciais via UI da plataforma.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id    UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_owner_select ON user_settings;
DROP POLICY IF EXISTS user_settings_owner_insert ON user_settings;
DROP POLICY IF EXISTS user_settings_owner_update ON user_settings;
DROP POLICY IF EXISTS user_settings_owner_delete ON user_settings;

CREATE POLICY user_settings_owner_select ON user_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_settings_owner_insert ON user_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_settings_owner_update ON user_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_settings_owner_delete ON user_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
