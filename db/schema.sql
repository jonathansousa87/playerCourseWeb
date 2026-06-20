-- Player Course Web - Schema inicial (Fase 1)
-- Substitui os dados atualmente salvos em localStorage e arquivos .txt
-- Montado em /docker-entrypoint-initdb.d/01-schema.sql pelo docker-compose

BEGIN;

-- Materiais de aula gerados por IA ou manualmente (Fase 8.3).
-- Substitui arquivos .md no filesystem — conteudo vive somente no banco.
-- kind: resumo | quiz | exemplos | diario | piada
CREATE TABLE IF NOT EXISTS lesson_materials (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    lesson_prefix TEXT        NOT NULL,
    kind          TEXT        NOT NULL CHECK (kind IN ('resumo', 'quiz', 'exemplos', 'diario', 'piada', 'podcast')),
    content       TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, lesson_prefix, kind)
);

CREATE INDEX IF NOT EXISTS idx_lesson_materials_course_prefix
    ON lesson_materials (course_title, lesson_prefix);

-- Autenticacao: gerenciada pelo Supabase Auth (auth.users). Tabela users
-- propria foi descontinuada na Etapa 9 — colunas user_id em todas as
-- tabelas abaixo apontam para auth.users(id) com ON DELETE CASCADE,
-- definidas via db/migrations/002_add_user_id.sql.

-- Conclusao de aulas inteiras (antes: localStorage completedLessons_<curso>)
CREATE TABLE IF NOT EXISTS lesson_progress (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    lesson_path   TEXT        NOT NULL,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, lesson_path)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_course
    ON lesson_progress (course_title);

-- Conclusao de etapas dentro de uma aula (antes: localStorage completedSteps_<curso>)
-- step_key: video | resumo | exemplos | quiz | flashcards | resumo_pessoal
CREATE TABLE IF NOT EXISTS step_completions (
    id             BIGSERIAL PRIMARY KEY,
    course_title   TEXT        NOT NULL,
    lesson_prefix  TEXT        NOT NULL,
    step_key       TEXT        NOT NULL,
    completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, lesson_prefix, step_key)
);

CREATE INDEX IF NOT EXISTS idx_step_completions_course_lesson
    ON step_completions (course_title, lesson_prefix);

-- Resumo pessoal escrito pelo aluno (antes: arquivo resumo_pessoal_<prefix>.txt)
-- content: campo livre (legacy + "outras notas" no UI atual).
-- prompts: respostas estruturadas (Fase 7.3 / Fiorella & Mayer 2016) - chaves
--   conhecidas: "answered", "connections", "example", "unclear".
CREATE TABLE IF NOT EXISTS personal_notes (
    id             BIGSERIAL PRIMARY KEY,
    course_title   TEXT        NOT NULL,
    lesson_prefix  TEXT        NOT NULL,
    content        TEXT        NOT NULL DEFAULT '',
    prompts        JSONB,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, lesson_prefix)
);

-- Migracao aditiva: adicionar a coluna em instalacoes existentes
ALTER TABLE personal_notes
    ADD COLUMN IF NOT EXISTS prompts JSONB;

-- Reflexoes do Pomodoro (antes: arquivo pomodoro_reflexoes.txt appendado)
-- kind: 'reflection' (resumo livre, compat), 'focus', 'break_active' (revisou cards), 'break_passive'
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    lesson_prefix TEXT,
    content       TEXT        NOT NULL,
    kind          TEXT        NOT NULL DEFAULT 'reflection',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pomodoro_sessions
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'reflection';

CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_course_date
    ON pomodoro_sessions (course_title, created_at DESC);

-- Diario semanal do aluno (antes: localStorage weeklyDiary_<curso>_<semana>)
CREATE TABLE IF NOT EXISTS weekly_diaries (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    week_key      TEXT        NOT NULL,
    learned       TEXT        NOT NULL DEFAULT '',
    decisions     TEXT        NOT NULL DEFAULT '',
    different     TEXT        NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, week_key)
);

-- === Fase 2: Flashcards com FSRS ===

-- Um deck por aula (lesson_prefix) de cada curso
CREATE TABLE IF NOT EXISTS flashcard_decks (
    id             BIGSERIAL PRIMARY KEY,
    course_title   TEXT        NOT NULL,
    lesson_prefix  TEXT        NOT NULL,
    source_file    TEXT,
    imported_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, lesson_prefix)
);

CREATE TABLE IF NOT EXISTS flashcards (
    id               BIGSERIAL PRIMARY KEY,
    deck_id          BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    front            TEXT        NOT NULL,
    back             TEXT        NOT NULL,
    card_type        TEXT        NOT NULL DEFAULT 'basic',
    difficulty_hint  SMALLINT,       -- 1..5 (se vier do gerador de IA na fase 3)
    tags             TEXT[]      NOT NULL DEFAULT '{}',
    source_timestamp TEXT,           -- "00:03:24" extraido do vtt (fase 3)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards (deck_id);

-- Estado FSRS por card (1:1 com flashcards). Criado on-demand ao primeiro review.
-- state: 0=New, 1=Learning, 2=Review, 3=Relearning
CREATE TABLE IF NOT EXISTS flashcard_reviews (
    card_id         BIGINT      PRIMARY KEY REFERENCES flashcards(id) ON DELETE CASCADE,
    state           SMALLINT    NOT NULL DEFAULT 0,
    due             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stability       DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty      DOUBLE PRECISION NOT NULL DEFAULT 0,
    elapsed_days    DOUBLE PRECISION NOT NULL DEFAULT 0,
    scheduled_days  DOUBLE PRECISION NOT NULL DEFAULT 0,
    reps            INTEGER     NOT NULL DEFAULT 0,
    lapses          INTEGER     NOT NULL DEFAULT 0,
    last_review     TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_due ON flashcard_reviews (due);

-- Historico de cada review (audit trail, opcional mas util pra metricas)
CREATE TABLE IF NOT EXISTS flashcard_review_log (
    id            BIGSERIAL PRIMARY KEY,
    card_id       BIGINT      NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    rating        SMALLINT    NOT NULL,   -- 1=Again, 2=Hard, 3=Good, 4=Easy
    state_before  SMALLINT,
    state_after   SMALLINT,
    elapsed_days  DOUBLE PRECISION,
    scheduled_days DOUBLE PRECISION,
    stability     DOUBLE PRECISION,
    difficulty    DOUBLE PRECISION,
    reviewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_review_log_card ON flashcard_review_log (card_id, reviewed_at DESC);

-- Hypercorrection (Metcalfe 2017): captura confianca declarada antes do
-- flip. 'high' + erro = embaraco produtivo (prioridade maxima de revisao).
ALTER TABLE flashcard_review_log
    ADD COLUMN IF NOT EXISTS confidence TEXT
    CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low'));

-- Diario tecnico por aula (template inicial vem do arquivo *_diario_tecnico_*.md)
CREATE TABLE IF NOT EXISTS technical_diary_notes (
    id             BIGSERIAL PRIMARY KEY,
    course_title   TEXT        NOT NULL,
    lesson_prefix  TEXT        NOT NULL,
    content        TEXT        NOT NULL DEFAULT '',
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, lesson_prefix)
);

-- === Fase 3: Quiz com tracking ===

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id             BIGSERIAL PRIMARY KEY,
    course_title   TEXT        NOT NULL,
    lesson_prefix  TEXT        NOT NULL,
    score          INTEGER     NOT NULL,
    total          INTEGER     NOT NULL,
    answered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_lesson
    ON quiz_attempts (course_title, lesson_prefix, answered_at DESC);

-- === Fase 4: Chat IA por aula (historico persistido no DB) ===

CREATE TABLE IF NOT EXISTS lesson_chats (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    lesson_prefix TEXT        NOT NULL,
    role          TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content       TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_chats_lesson
    ON lesson_chats (course_title, lesson_prefix, created_at);

-- === Fase 7: Pre-questioning (Carpenter & Toftness 2017) ===
-- Perguntas geradas por IA antes do video. Score nao importa — o ato de
-- tentar lembrar prepara a codificacao (efeito de pre-questao).

-- Cache de perguntas geradas (uma versao por aula, regenerada se quiser
-- via DELETE + POST /api/ia/prequestions)
CREATE TABLE IF NOT EXISTS lesson_prequestions (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    lesson_prefix TEXT        NOT NULL,
    questions     JSONB       NOT NULL,
        -- shape: [{ question, options: [a,b,c,d], correct_idx, explanation }]
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_title, lesson_prefix)
);

-- Tentativas do aluno (preserva historico — o primeiro attempt eh o
-- "puro"; reattempts apos ver o video sao re-revisao, nao pre-questao).
CREATE TABLE IF NOT EXISTS prequestion_attempts (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    lesson_prefix TEXT        NOT NULL,
    answers       JSONB       NOT NULL,
        -- shape: [{ question_idx, selected_idx, is_correct }]
    score         INTEGER     NOT NULL,
    total         INTEGER     NOT NULL,
    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prequestion_attempts_lesson
    ON prequestion_attempts (course_title, lesson_prefix, attempted_at DESC);

-- Tempo real de consumo passivo (Fase 7.4 opt-in / Bjork): videos
-- assistidos, resumos lidos, exemplos lidos. Eh agregado pelo endpoint
-- /api/stats/activity-balance — quando ha dados aqui no periodo, prefere
-- esses segundos em vez da estimativa por step_completion.
CREATE TABLE IF NOT EXISTS view_sessions (
    id            BIGSERIAL PRIMARY KEY,
    course_title  TEXT        NOT NULL,
    lesson_prefix TEXT        NOT NULL,
    kind          TEXT        NOT NULL CHECK (kind IN ('video', 'resumo', 'exemplos')),
    seconds       INTEGER     NOT NULL CHECK (seconds >= 0),
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_view_sessions_kind_date
    ON view_sessions (kind, started_at DESC);

COMMIT;
