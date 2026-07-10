-- Papel (role) e status de aprovacao por usuario. Antes disso, qualquer conta
-- criada via signUp do Supabase Auth conseguia logar direto, sem aprovacao.
-- role='admin' + status='approved' e quem pode ver a secao administrativa e
-- as rotas /api/admin/* e /api/maintenance/* (ver server/auth.js).

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user'    CHECK (role IN ('user','admin')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_owner_select ON user_profiles;

-- So SELECT do proprio registro. Sem policy de insert/update/delete pra
-- usuario comum de proposito: role/status so mudam pelo backend, que conecta
-- com privilegio que ignora RLS (mesmo padrao de db/migrations/005_enable_rls.sql).
CREATE POLICY user_profiles_owner_select ON user_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Bootstrap: o unico usuario hoje vira admin aprovado direto. UUID conferido
-- direto em auth.users (o citado em db/migrations/003_backfill_user_id.sql
-- estava desatualizado — o projeto Supabase foi recriado depois daquela
-- migration).
INSERT INTO user_profiles (user_id, email, role, status)
VALUES ('7e55070f-b924-4607-a023-2fe199b0a73b', 'jonathandrumbass@gmail.com', 'admin', 'approved')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', status = 'approved';
