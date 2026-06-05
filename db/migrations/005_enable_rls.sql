-- Etapa 7 — Row Level Security.
-- Backend Express usa service_role key (bypassa RLS) — continua funcionando
-- com filtros user_id manuais (Etapa 6). RLS protege clientes que falam
-- direto com Supabase via anon key (futuro app RN).
--
-- Padrao: tabelas com user_id ganham 4 policies (SELECT/INSERT/UPDATE/DELETE)
-- todas com auth.uid() = user_id. Tabelas globais (lesson_materials,
-- lesson_prequestions) habilitam RLS mas so liberam SELECT pra todos —
-- escrita fica reservada ao backend (service_role).

-- Helper macro: cada bloco DO $$ ... $$ checa pg_policy antes de criar a
-- policy, mantendo idempotencia (rerun nao explode).

-- ─────────────────────────────────────────────────────────────────────
-- Tabelas com user_id (14)
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
  user_tables TEXT[] := ARRAY[
    'lesson_progress','step_completions','personal_notes','pomodoro_sessions',
    'weekly_diaries','flashcard_decks','flashcards','flashcard_reviews',
    'flashcard_review_log','quiz_attempts','lesson_chats','prequestion_attempts',
    'view_sessions','technical_diary_notes'
  ];
BEGIN
  FOREACH t IN ARRAY user_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- SELECT
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select_own') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id)',
        t || '_select_own', t
      );
    END IF;

    -- INSERT
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert_own') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)',
        t || '_insert_own', t
      );
    END IF;

    -- UPDATE
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update_own') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
        t || '_update_own', t
      );
    END IF;

    -- DELETE
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_delete_own') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() = user_id)',
        t || '_delete_own', t
      );
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Tabelas globais (cache compartilhado de IA): leitura publica autenticada,
-- escrita so pelo backend (service_role bypassa RLS automaticamente).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE lesson_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_prequestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_materials' AND policyname = 'lesson_materials_select_all') THEN
    CREATE POLICY lesson_materials_select_all ON lesson_materials
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_prequestions' AND policyname = 'lesson_prequestions_select_all') THEN
    CREATE POLICY lesson_prequestions_select_all ON lesson_prequestions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
