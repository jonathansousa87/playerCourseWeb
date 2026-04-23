# Roadmap — o que falta

Documento vivo do que sobra do plano original (componentização + fixação via neurociência/IA, baseado em `pesquisa.txt`). O que já foi feito está em "Concluído" só pra dar contexto; o importante é a seção "Próximos passos".

---

## Concluído

- [x] Componentização do `CoursePlatform` (era 1 arquivo de 2000+ linhas) → `CourseCard`, `CourseSidebar`, `ModuleItem`, `LessonHeader`, `LessonStepper`, `VideoPlayer`, `VideoControls`, `PDFViewer`, `HTMLViewer`, `MarkdownViewer`, `UnsupportedViewer`, `ConfigModal`, `PersonalSummary`, `PomodoroTimer`, `WeeklyDiaryModal`, `FlashcardViewer`, `DailyReview`.
- [x] Hooks extraídos: `useCourseData`, `useCourseProgress`, `useVideoPlayer`, `useFullscreen`, `useSidebar`.
- [x] Backend com Postgres (docker-compose) + `db/schema.sql` + `db/migrate.js`.
- [x] Persistência de progresso (lessons + steps) no DB, migração de `localStorage`.
- [x] Resumo pessoal + diário semanal + sessões de Pomodoro gravadas por curso.
- [x] **FSRS completo**: schema de decks/cards/reviews/log, `ts-fsrs` no servidor, endpoints `/api/flashcards/*`, `FlashcardViewer` lendo do DB com ratings 1-4, tela **"Revisar"** global (`DailyReview`) agregando cards vencidos de todos os cursos.
- [x] **Viewers com design unificado**: `QuizViewer`, `ExamplesViewer` e `MarkdownViewer` (aba Resumo) renderizam com Tailwind do app (tema escuro consistente) em vez de iframe com CSS da IA.
- [x] **Parser robusto de flashcards**: 4 formatos suportados (tab, `<b>` parcial, multi-espaços, padrão "P: R") para tolerar variações de saída do LLM. Validação pré-salvamento evita gerações quebradas.

---

## Próximos passos (ordem de valor × esforço)

### 1. Quiz com tracking de resultados — CONCLUÍDO ✓
- [x] Parser dos `*_quiz_*.html` pra estrutura `{question, options, answer}` (`src/utils/quizParser.js`).
- [x] Novo componente `QuizViewer.jsx` com UI própria (Tailwind + feedback imediato).
- [x] Tabela `quiz_attempts (course_title, lesson_prefix, score, total, answered_at)` + endpoints.
- [x] Passo só conta como concluído se `score >= 70%`.
- [x] Questões erradas viram flashcards extras no deck da aula (endpoint `/wrong-to-flashcards`, `card_type='quiz_wrong'`, dedup por front+back, feedback visual ao finalizar).

### 2. Diário técnico por aula — CONCLUÍDO ✓
- [x] Step `"diario"` adicionado ao `STEP_CONFIG` do `LessonStepper.jsx` (ícone 📓, cor rose).
- [x] Editor markdown inline em `TechnicalDiary.jsx` que carrega template do arquivo `*_diario_tecnico_*.md` e persiste conteúdo.
- [x] Tabela `technical_diary_notes (course_title, lesson_prefix, content, updated_at)` + endpoints `/api/db/diary-tecnico/:course/:prefix`.

### 3. Dashboard de estudo — CONCLUÍDO ✓
- [x] Heatmap de consistência (90 dias) — agrega `flashcard_review_log.reviewed_at` + `pomodoro_sessions.created_at` por dia.
- [x] Curva de retenção por curso: acerto rolling 7d vs 30d com contagem de reviews. Cores semânticas (verde ≥ 80%, amarelo 60-79%, vermelho < 60%).
- [x] Top cards "lapsos" — `flashcards` ordenados por lapses desc com course/lesson.
- [x] ETA zero backlog — `dueCards ÷ reviews_por_dia_14d` (mostrado em dias).
- [x] Seção "Perfil cognitivo" agrega streak, hora ótima/fraca, drift D.
- [x] Seção "Cards confusos" mostra grupos de fronts similares lado a lado (item 6.3).

### 4. Pomodoro acoplado ao FSRS — CONCLUÍDO ✓
- [x] No fim do ciclo de foco, `choose_break` popup oferece "Revisar 5 cards" (pausa ativa via `fetchDueFlashcards({ limit: 5 })` + mini review com FSRS) ou pausa passiva.
- [x] Duração adaptativa com base em `accuracy7d` do endpoint `/api/stats/recent`: < 60% → 20min, > 85% → 45min, caso contrário 25min padrão (`adaptiveFocusSeconds` em `PomodoroTimer.jsx`).
- [x] Coluna `pomodoro_sessions.kind` existe no schema e `savePomodoroSession` aceita `'reflection' | 'break_active' | 'break_passive'` (gravado conforme a escolha do usuário no fim da pausa).

### 5. Geração automática de conteúdo (IA) — CONCLUÍDO ✓
Implementado via DeepSeek API (v3 chat, `deepseek-chat`).

- [x] Pipeline lê `.vtt` da aula, chama LLM, grava arquivo com sufixo `_ia` no mesmo diretório.
- [x] Endpoint `POST /api/ia/generate` aceita `{courseTitle, lessonPrefix, kinds: [resumo|quiz|flashcards|diario], model}`.
- [x] Flashcards gerados entram no deck FSRS via `importDeck` (dedup por `front+back`).
- [x] UI: botão "Gerar IA" no LessonStepper abre `AIGenerateModal` com checkboxes por tipo + seleção de modelo.
- [x] Regex `LESSON_SUFFIXES` aceita `_ia` opcional; agrupamento prioriza a variante IA quando existe manual+IA.
- [x] Smoke test real: gera `_resumo_dub_01_ia.md` em ~17s (1121 tokens, ~$0.003).

### 6. Perfil cognitivo / adaptativo — CONCLUÍDO ✓
O FSRS já adapta por card. O próximo nível:

- [x] `user_profile` com estatísticas agregadas — `/api/stats/profile` retorna streak, hora ótima/fraca (acerto por hora do dia), drift de dificuldade (D médio 7d vs 7-30d), totais. Exposto no Dashboard.
- [x] Reorder de módulos: badge de acerto por módulo (verde/amarelo/vermelho) + banner sugerindo revisão quando módulos ficam < 60%. Endpoint `/api/stats/lesson-accuracy` agrega review log; hook `useLessonAccuracy` expõe via CourseContext.
- [x] Detecção de "confusão semântica": `server/semanticConfusion.js` com tokenização + Jaccard + union-find agrupa cards com `front` similar e `lapses >= 2`. Endpoint `/api/flashcards/confusion`. Nova seção no Dashboard mostra grupos lado a lado.

---

## Débito técnico

- [ ] `CoursePlatform.jsx` ainda tem ~830 linhas — dá pra extrair `CoursesGrid`, `CoursesHeader`, `LessonsView` como components separados.
- [ ] `server.js` é monolítico — separar rotas em `server/routes/*.js` (hoje só `server/flashcards.js` foi quebrado).
- [ ] Avisos de `react/prop-types` e `React unused` em todos os `.jsx` (não bloqueia, mas a lint tá ruidosa). Ou adiciona PropTypes, ou desabilita a regra globalmente.
- [~] Testes: cobertura crescendo. Cobertos: `server/flashcardParser.js` (15 testes) e `server/semanticConfusion.js` (16 testes — tokenize, Jaccard, union-find). Falta: lógica FSRS de `server/flashcards.js` (importDeck, reviewCard, getDueCards) e parsers do frontend (`quizParser.js`, `examplesParser.js`).
- [ ] `video-durations-cache.json` commitado — mover pra `.gitignore` ou pro DB.
- [ ] `CoursePlatform_bkp.jsx` — se existir no repo, apagar.
- [ ] `start.sh` assume `fish`; `start-universal.sh` e `start.bat` duplicam intenção — consolidar.

---

## Decisões em aberto

- **Next.js 16?** A pergunta original (React puro vs Next). Hoje o backend Express + SPA Vite funciona. Migração só vale se quiser SSR pra SEO (improvável nesse caso de uso local) ou para API routes colocadas no mesmo app. **Recomendação: ficar com Vite + Express separados.**
- **Auth multi-user?** Hoje é single-user local. Se quiser compartilhar a plataforma, precisa `users` + JWT + escopar todas as queries por `user_id`.
- **Qual LLM pra geração de conteúdo?** Local (Ollama + llama3) vs API (Claude/GPT). Local é gratis mas qualidade menor; API custa mas gera melhor. Decidir antes do item 5.
