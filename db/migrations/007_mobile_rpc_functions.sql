-- Funcoes RPC para o app Android (acesso direto ao Supabase, sem Express)

-- Cards vencidos do usuario logado, com dados FSRS completos.
-- Replica a logica de getDueCards do server/flashcards.js.
CREATE OR REPLACE FUNCTION get_due_cards(p_limit int DEFAULT 50)
RETURNS TABLE (
  id              bigint,
  front           text,
  back            text,
  deck_id         bigint,
  course_title    text,
  lesson_prefix   text,
  due             timestamptz,
  state           int,
  stability       double precision,
  difficulty      double precision,
  elapsed_days    int,
  scheduled_days  int,
  reps            int,
  lapses          int,
  last_review     timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    c.id,
    c.front,
    c.back,
    c.deck_id,
    d.course_title,
    d.lesson_prefix,
    r.due,
    COALESCE(r.state, 0)::int             AS state,
    COALESCE(r.stability, 0.0)            AS stability,
    COALESCE(r.difficulty, 0.0)           AS difficulty,
    COALESCE(r.elapsed_days, 0)::int      AS elapsed_days,
    COALESCE(r.scheduled_days, 0)::int    AS scheduled_days,
    COALESCE(r.reps, 0)::int              AS reps,
    COALESCE(r.lapses, 0)::int            AS lapses,
    r.last_review
  FROM flashcards c
  JOIN flashcard_decks d ON d.id = c.deck_id
  LEFT JOIN flashcard_reviews r ON r.card_id = c.id
  WHERE c.user_id = auth.uid()
    AND (r.due IS NULL OR r.due <= NOW())
    AND EXISTS (
      SELECT 1 FROM step_completions sc
      WHERE sc.course_title = d.course_title
        AND sc.lesson_prefix = d.lesson_prefix
        AND sc.user_id = auth.uid()
    )
  ORDER BY COALESCE(r.due, NOW() - INTERVAL '100 years') ASC
  LIMIT p_limit;
$$;

-- Cursos com total de cards e cards vencidos (para tela de cursos).
CREATE OR REPLACE FUNCTION get_courses()
RETURNS TABLE (
  course_title  text,
  total_cards   bigint,
  due_cards     bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    d.course_title,
    COUNT(DISTINCT c.id)                                                          AS total_cards,
    COUNT(DISTINCT c.id) FILTER (WHERE r.due IS NULL OR r.due <= NOW())           AS due_cards
  FROM flashcard_decks d
  JOIN flashcards c ON c.deck_id = d.id
  LEFT JOIN flashcard_reviews r ON r.card_id = c.id
  WHERE d.user_id = auth.uid()
  GROUP BY d.course_title
  ORDER BY due_cards DESC, d.course_title;
$$;

-- Aulas de um curso com materiais disponiveis e progresso.
CREATE OR REPLACE FUNCTION get_lessons(p_course_title text)
RETURNS TABLE (
  lesson_prefix   text,
  kinds           text[],
  steps_done      bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    m.lesson_prefix,
    ARRAY_AGG(DISTINCT m.kind ORDER BY m.kind) AS kinds,
    COUNT(DISTINCT sc.step_key)                AS steps_done
  FROM lesson_materials m
  LEFT JOIN step_completions sc
    ON sc.course_title = m.course_title
   AND sc.lesson_prefix = m.lesson_prefix
   AND sc.user_id = auth.uid()
  WHERE m.course_title = p_course_title
  GROUP BY m.lesson_prefix
  ORDER BY m.lesson_prefix;
$$;
