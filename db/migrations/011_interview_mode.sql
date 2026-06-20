-- Modo "Entrevista de Emprego" por modulo.
-- interview_questions: cache GLOBAL das 5 perguntas de um modulo (reuso entre
--   usuarios, como lesson_prequestions). Keyed por curso + caminho do modulo.
-- interview_sessions: tentativas POR usuario (respostas + feedback + nota).

CREATE TABLE IF NOT EXISTS interview_questions (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    module_path   TEXT        NOT NULL,
    module_title  TEXT,
    questions     JSONB       NOT NULL,
        -- shape: [{ question, topic }]
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, module_path)
);

CREATE TABLE IF NOT EXISTS interview_sessions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID        NOT NULL,
    course_title  TEXT        NOT NULL,
    module_path   TEXT        NOT NULL,
    answers       JSONB       NOT NULL,
        -- shape: [{ question, answer }]
    feedback      JSONB       NOT NULL,
        -- shape: { per_question: [{ score, comment }], overall_comment }
    score         INTEGER     NOT NULL,
    total         INTEGER     NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user
    ON interview_sessions (user_id, course_title, module_path, created_at DESC);
