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

### 2. Diário técnico por aula — valor médio, esforço baixo
Os arquivos `*_diario_tecnico_*.md` já existem em cada aula (ex.: `36.-Introduction-716K_diario_tecnico_dub_06.md`) mas não aparecem no stepper.

- [ ] Adicionar step `"diario"` no `STEP_CONFIG` do `LessonStepper.jsx`.
- [ ] Editor markdown inline (reaproveitar `PersonalSummary` com template pré-carregado do arquivo).
- [ ] Persistir em `notes` tabela (tipo `diario_tecnico`).

### 3. Dashboard de estudo — alto valor, esforço médio
Hoje não há visão agregada. O `DailyReview` já tem um resumo por curso, mas falta:

- [ ] Heatmap de consistência (dias estudados nos últimos 90 dias) — dados já existem em `flashcard_review_log.reviewed_at` e `pomodoro_sessions`.
- [ ] Curva de retenção real (taxa de acerto rolling 7d vs 30d) por curso.
- [ ] Top cards "lapsos" — `flashcards` com `lapses > N` ordenados.
- [ ] Tempo estimado pra zerar backlog (due cards ÷ ritmo atual).

### 4. Pomodoro acoplado ao FSRS — valor médio, esforço baixo
O `PomodoroTimer` roda isolado. Podia:

- [ ] No fim de um ciclo de foco, sugerir "revise 5 cards vencidos" em vez de só descansar passivamente (active recall na pausa).
- [ ] Ajustar duração com base em acerto recente: taxa < 60% → diminui foco pra 20min, > 85% → estende pra 45min.
- [ ] Gravar `pomodoro_sessions.kind = 'focus'|'break_active'|'break_passive'`.

### 5. Geração automática de conteúdo (IA) — CONCLUÍDO ✓
Implementado via DeepSeek API (v3 chat, `deepseek-chat`).

- [x] Pipeline lê `.vtt` da aula, chama LLM, grava arquivo com sufixo `_ia` no mesmo diretório.
- [x] Endpoint `POST /api/ia/generate` aceita `{courseTitle, lessonPrefix, kinds: [resumo|quiz|flashcards|diario], model}`.
- [x] Flashcards gerados entram no deck FSRS via `importDeck` (dedup por `front+back`).
- [x] UI: botão "Gerar IA" no LessonStepper abre `AIGenerateModal` com checkboxes por tipo + seleção de modelo.
- [x] Regex `LESSON_SUFFIXES` aceita `_ia` opcional; agrupamento prioriza a variante IA quando existe manual+IA.
- [x] Smoke test real: gera `_resumo_dub_01_ia.md` em ~17s (1121 tokens, ~$0.003).

### 6. Perfil cognitivo / adaptativo — valor alto, esforço alto
O FSRS já adapta por card. O próximo nível:

- [x] `user_profile` com estatísticas agregadas — `/api/stats/profile` retorna streak, hora ótima/fraca (acerto por hora do dia), drift de dificuldade (D médio 7d vs 7-30d), totais. Exposto no Dashboard.
- [ ] Reorder de módulos: se acerto em módulo X cai, empurra revisão antes de liberar módulo X+1.
- [ ] Detecção de "confusão semântica": cards com `front` similar + `lapses > N` agrupados pra revisão comparativa.

---

## Débito técnico

- [ ] `CoursePlatform.jsx` ainda tem ~830 linhas — dá pra extrair `CoursesGrid`, `CoursesHeader`, `LessonsView` como components separados.
- [ ] `server.js` é monolítico — separar rotas em `server/routes/*.js` (hoje só `server/flashcards.js` foi quebrado).
- [ ] Avisos de `react/prop-types` e `React unused` em todos os `.jsx` (não bloqueia, mas a lint tá ruidosa). Ou adiciona PropTypes, ou desabilita a regra globalmente.
- [~] Testes: cobertura ainda baixa. Parser de flashcards extraído para `server/flashcardParser.js` e coberto por 15 testes Vitest (`flashcardParser.test.js`). Falta: lógica FSRS de `server/flashcards.js` (importDeck, reviewCard, getDueCards) e parsers do frontend (`quizParser.js`, `examplesParser.js`).
- [ ] `video-durations-cache.json` commitado — mover pra `.gitignore` ou pro DB.
- [ ] `CoursePlatform_bkp.jsx` — se existir no repo, apagar.
- [ ] `start.sh` assume `fish`; `start-universal.sh` e `start.bat` duplicam intenção — consolidar.

---

## Decisões em aberto

- **Next.js 16?** A pergunta original (React puro vs Next). Hoje o backend Express + SPA Vite funciona. Migração só vale se quiser SSR pra SEO (improvável nesse caso de uso local) ou para API routes colocadas no mesmo app. **Recomendação: ficar com Vite + Express separados.**
- **Auth multi-user?** Hoje é single-user local. Se quiser compartilhar a plataforma, precisa `users` + JWT + escopar todas as queries por `user_id`.
- **Qual LLM pra geração de conteúdo?** Local (Ollama + llama3) vs API (Claude/GPT). Local é gratis mas qualidade menor; API custa mas gera melhor. Decidir antes do item 5.
