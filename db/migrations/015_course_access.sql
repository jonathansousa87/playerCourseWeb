-- Quais cursos cada usuario nao-admin pode ver. Admin sempre ve tudo (bypass
-- no backend, nao usa esta tabela). Usuario sem nenhuma linha aqui nao ve
-- curso nenhum (default-deny, mesmo espirito do status='pending' de
-- user_profiles) — o admin libera pelo painel.

CREATE TABLE IF NOT EXISTS course_access (
  user_id      UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  course_title TEXT NOT NULL,
  granted_by   UUID REFERENCES auth.users,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, course_title)
);

ALTER TABLE course_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_access_owner_select ON course_access;

-- So SELECT do proprio registro. Sem policy de insert/update/delete pra
-- usuario comum: quem concede/revoga e sempre o backend (service role,
-- bypassa RLS), nunca o proprio usuario.
CREATE POLICY course_access_owner_select ON course_access
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
