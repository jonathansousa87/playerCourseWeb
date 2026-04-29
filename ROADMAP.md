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
Implementado via DeepSeek API (v4 flash, `deepseek-v4-flash` — context 1M, cache hit ~95% no chat).

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

## Fase 7 — Neurociência aplicada (pesquisa 2017-2024)

Baseado em `pesquisa2.txt`. O FSRS já é estado-da-arte (Ye 2023, ~30% melhor que SM-2 do Anki) e o testing effect que usamos tem g = 0.56 em meta-análise de 308 experimentos (Adesope 2017, Yang 2021). Os itens abaixo são **avanços recentes** que valem incorporar, ordenados por **valor × esforço**.

### 7.1. Pre-questioning — perguntas ANTES do vídeo — CONCLUÍDO ✓
- [x] Step novo `"prequiz"` no `LessonStepper.jsx` antes do vídeo (🎯, cor yellow). Aparece sempre que existe vídeo — gera on-demand via IA.
- [x] Endpoint `POST /api/ia/prequestions` gera 3 perguntas de múltipla escolha (4 alternativas + correct_idx + explanation) via DeepSeek a partir da transcrição (`.txt` ou `.vtt`). Validação de shape do JSON antes de salvar.
- [x] Endpoint `GET /api/ia/prequestions/:course/:prefix` retorna cache + última tentativa. `DELETE` limpa cache + tentativas (regenerar do zero).
- [x] Endpoint `POST /api/ia/prequestions/:course/:prefix/attempts` salva tentativas com score/total computados.
- [x] Tabelas `lesson_prequestions` (cache JSONB) e `prequestion_attempts` (histórico de tentativas).
- [x] Componente `PreQuiz.jsx`: estado vazio → botão "Gerar com IA" → quiz de 3 questões → "Ver respostas" → mostra correta em verde / errada em vermelho + explicação. Botão "Regenerar" + "Tentar de novo".
- [x] Smoke test e2e: gera 3 perguntas em ~6.7s (1197 prompt + ~600 completion tokens), 404 em aulas sem transcrição.

**Por que:** perguntar antes melhora retenção em 10-25%, mesmo errando — o ato de tentar lembrar prepara a codificação.

**Citações:** Carpenter & Toftness (2017) *J Applied Research in Memory and Cognition*; Pan et al. (2020) *Memory & Cognition*.

### 7.2. Feedback elaborado em flashcards errados — CONCLUÍDO ✓
- [x] Após rating 1 (Errei), `FlashcardViewer.jsx` e `DailyReview.jsx` suspendem o avanço e abrem `WhyErrorOverlay.jsx`.
- [x] Overlay mostra front + resposta correta + botão "Por que errei?" → chama `POST /api/ia/chat` com prompt pré-formatado pedindo explicação + analogia/mnemônico.
- [x] Reuso direto da infra de chat IA — usa `server/ai/chat.js`, `lesson_chats` (Mullet & Butler 2022). Cards de quiz wrong também funcionam (lessonPrefix da aula original).
- [x] Atalhos de teclado (1/2/3/4) bloqueados enquanto overlay aberto. "Pular" avança sem chamar IA.
- [x] Smoke e2e: explicação ~538 tokens em 8.4s, com analogia ("diretrizes, não leis da física").

**Por que:** feedback explicativo é 1.5-2× mais eficaz que feedback binário ("certo/errado"). Hoje o quiz mostra explicação, mas flashcards só mostram o back.

**Citações:** Mullet & Butler (2022) *Educational Psychology Review*; Van der Kleij et al. (2015) *Review of Educational Research*.

### 7.3. Prompts estruturados em "Meu Resumo" — CONCLUÍDO ✓
- [x] `PersonalSummary.jsx` refatorado: 4 textareas com prompts estruturados (`answered`, `connections`, `example`, `unclear`) + campo livre "Outras notas". Helper text por prompt.
- [x] Schema: coluna `prompts JSONB` aditiva em `personal_notes` (legacy `content TEXT` virou "outras notas"). Migração não-destrutiva via `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- [x] Backend: `GET /api/db/notes/:course/pessoal/:prefix` retorna `{content, prompts, updated_at}`. `POST` aceita `prompts` opcional — clientes legados que enviam só `content` preservam os prompts existentes.
- [x] Auto-save 2s + botão manual. Contador de palavras agrega prompts + content.
- [x] Smoke e2e: roundtrip POST→GET com 4 prompts, backward compat (POST sem prompts não apaga os existentes).

**Por que:** self-explanation tem efeito médio g ≈ 0.55 (~equivalente ao testing effect), mas só com prompts estruturados — campo livre tem retorno bem menor.

**Citações:** Fiorella & Mayer (2016) *Educational Psychology Review*; Bisra et al. (2018) meta-analysis.

### 7.4. Métrica recall/leitura no Dashboard — CONCLUÍDO ✓
- [x] Endpoint `GET /api/stats/activity-balance?days=N` em `server/routes/stats.js`. Estima tempo ativo (flashcard reviews × 10s, quiz × 30s/questão, pre-quiz × 25s/questão) e passivo (video × 8min, resumo × 4min, exemplos × 6min) a partir dos eventos persistidos.
- [x] Recomendação textual com 5 níveis: `good` (≥1:1), `ok` (≥0.5), `warning` (≥0.25), `bad` (<0.25), `no-data`. Mensagens variam ("você está consumindo 3x mais que testando — agende mais revisões").
- [x] Card "Recall vs Leitura" no `Dashboard.jsx` (1º card, alta visibilidade): badge colorido + ratio + 2 colunas (ativo verde / passivo cinza) + barra horizontal proporcional + breakdown por tipo.
- [x] Smoke e2e: 30d → 23min ativo / 58min passivo / ratio 0.40 / "warning" com recomendação correta.
- [x] **Instrumentação fina (tracked time)**: tabela `view_sessions (course, prefix, kind, seconds)`. Hooks `useReadTimer` (resumo/exemplos, mount→unmount com pausa em `visibilitychange`) e `useWatchTimer` (video, acumula só `timeupdate` diffs <2s pra ignorar seek). Endpoint `POST /api/stats/view-session` (descarta <5s, cap 4h). `sendBeacon` no unmount sobrevive a fechar a aba.
- [x] Balance prefere `tracked` quando há dados, fallback para `estimated`. Response inclui `passive.source: 'tracked' | 'mixed' | 'estimated'` por kind. Smoke e2e: POST 600s vídeo → balance retorna seconds reais com source=tracked, exemplos sem session continua estimated.

**Por que:** fluência ≠ aprendizado. Ler de novo "soa fácil" mas não consolida. Tornar a razão visível ajuda o usuário a balancear consumo vs recall ativo.

**Citações:** Bjork & Bjork (2011) *desirable difficulties*; Soderstrom & Bjork (2015) *Perspectives on Psychological Science*.

### 7.5. Hypercorrection — captura de confiança antes do flip — CONCLUÍDO ✓
- [x] Coluna `flashcard_review_log.confidence` (`'high' | 'medium' | 'low' | NULL`) com CHECK constraint, migração aditiva.
- [x] Antes do flip, `FlashcardViewer.jsx` e `DailyReview.jsx` mostram componente `ConfidenceButtons` ("Não sei / Mais ou menos / Sei") e bloqueiam o flip até captura. Atalhos J/K/L. Reusa via export do FlashcardViewer.
- [x] `reviewCard` aceita `confidence` opcional, persiste no log. Helper API `reviewFlashcard(cardId, rating, confidence)`.
- [x] Endpoint `GET /api/flashcards/hypercorrection?days=N&limit=K` retorna cards com `confidence='high' AND rating<=2` (embaraço produtivo) ordenados por surprise_errors DESC.
- [x] Card "Hypercorrection" no Dashboard (borda laranja, prioridade alta) com lista dos cards mais surpreendentes + contagem de erros vs total de altas.
- [x] Smoke e2e: POST review com confidence=high + rating=1 → card aparece no endpoint hypercorrection com surprise_errors=1.

**Por que:** errar com confiança alta e ser corrigido retém melhor que acertar de primeira (hypercorrection effect). Já capitalizamos parcialmente (questões erradas → flashcards), mas não diferenciamos "errei certo" de "errei sem saber".

**Citações:** Metcalfe (2017) *Annual Review of Psychology*.

### 7.6. Interleaving forçado entre cursos similares — CONCLUÍDO ✓
- [x] `src/utils/sessionOrdering.js` (puro, testado): `interleaveByCourse(cards)` faz round-robin preservando ordem dentro de cada curso. `prioritizeConfusion(cards, ids)` move cards de grupos confusos pro início (também interleaved). `buildSessionQueue(cards, confusionIds)` é o pipeline completo.
- [x] `DailyReview.jsx` busca `/api/flashcards/confusion` no carregamento, monta Set de IDs e aplica `buildSessionQueue` quando há > 1 curso e modo está ON.
- [x] Toggle "Modo intercalado" no header (default ON, persistido em `localStorage` chave `dailyReview.interleaveMode`). Aparece só quando há mais de 1 curso na queue.
- [x] 13 testes unitários em `sessionOrdering.test.js` cobrindo casos: vazio, 1 curso, balanceado A-B-A-B, desbalanceado, preserva ordem dentro do bucket, snake_case e camelCase, prioritizeConfusion, buildSessionQueue.

**Por que:** A-B-A-B retém melhor que A-A-A-B-B-B em tópicos parecidos, embora o aluno *sinta* que aprende menos. Já temos a "confusão semântica" — perfeita pra aplicar interleaving direcionado.

**Citações:** Rohrer, Dedrick & Stershic (2015) *J Educational Psychology*; Brunmair & Richter (2019) *Psychological Bulletin* (meta-análise).

### 7.7. Badges de retenção de longo prazo — CONCLUÍDO ✓
- [x] Endpoint `GET /api/stats/retention-badges` agrega cards "maduros" (state FSRS = 2) por 6 tiers de idade desde primeiro review: 1 semana, 1 mês, 3 meses, 6 meses, 1 ano, 2 anos. Usa `MIN(reviewed_at)` do `flashcard_review_log`.
- [x] `recentMilestones`: cards que cruzaram um tier nos últimos 7 dias (acabaram de bater marco) — limit 20, ordenados por menor age_days primeiro.
- [x] Card "Conquistas" no Dashboard com 6 badges coloridos (cinza→azul→cyan→esmeralda→amber→rosa por tier) + lista dos marcos recentes mostrando tier + front do card + curso.
- [x] Helper `fetchRetentionBadges()` em `progressApi.js`. Card só aparece se `totalMature > 0`.
- [x] Smoke e2e: 32 cards maduros total, 10 no tier 1w, 10 marcos batidos nos últimos 7d (cards com age 8d).

**Por que:** Bahrick & Hall mostraram que 5 sessões espaçadas retém conteúdo por DÉCADAS. Marcos visíveis motivam consistência sem exigir feature nova — é só celebrar o que o FSRS já faz.

**Citações:** Bahrick & Hall (1991, com followups 2013-2020).

### 7.8. Notificação pré-sono (alto valor, alto esforço)
- [ ] Converter o app em PWA (`vite-plugin-pwa`, manifest, service worker).
- [ ] Permissão de notificação opt-in.
- [ ] Inferir "horário pré-sono" do `user_profile` (menor atividade do dia + bestHour - 4h, fallback 22h).
- [ ] Notificação 30-60min antes: "Revise X cards antes de dormir — consolida melhor".
- [ ] Notificação matinal opcional: "Você revisou X cards ontem à noite. Teste-se agora".

**Por que:** memórias declarativas se consolidam principalmente em SWS (slow-wave sleep). Codificar perto do sono retém ~10-30% melhor (TMR meta-analysis Hu 2020).

**Citações:** Rasch & Born (2013) *Physiological Reviews*; Hu et al. (2020) *Psychological Bulletin* (meta-análise TMR); Walker (2017) *Why We Sleep*.

---

## Débito técnico

- [x] `CoursePlatform.jsx` (901 linhas) quebrado em: `CoursesScreen` (home + modal de config), `LessonsView` (lista de aulas + banner de revisão), `LessonPlayer` (decide entre stepper, HTML/PDF, video legacy, unsupported — com `SidebarSlideout` e `FullscreenSidebar` como subcomponentes locais). `CoursePlatform.jsx` ficou com 355 linhas (hooks + state + handlers + escolha de view).
- [x] `server.js` separado em `server/routes/*.js`: `courses`, `notes`, `progress`, `flashcards`, `quiz`, `stats`, `ia`. `server/config.js` com get/set do `COURSES_PATH` mutável. `server.js` ficou com 41 linhas (bootstrap + routers).
- [x] Lint: `react/prop-types` desabilitada globalmente (projeto usa JS vanilla, não PropTypes). Regra `no-unused-vars` com exceção pra `^React$` (JSX transform). Arquivos backend (`server.js`, `db/**`, `server/**`) ganharam globals do Node. `react/no-unknown-property` com ignore list pra `webkit-playsinline` e `x5-playsinline` (HTML attrs reais de mobile). Imports órfãos e catch variables não usadas removidos em 6 arquivos. **0 erros**, 13 warnings de estilo (fast-refresh e exhaustive-deps).
- [x] Testes: **59 testes em 5 arquivos**. Backend: `flashcardParser.js` (15), `semanticConfusion.js` (16), `flashcards.js` (14 com mocks de DB+fs). Frontend: `quizParser.js` (7, happy-dom) e `examplesParser.js` (7, happy-dom). Única pendência é integração com Postgres real (opcional).
- [x] `video-durations-cache.json` está no `.gitignore` (não tracked). Cache fica local.
- [x] `CoursePlatform_bkp.jsx` removido do repo.
- [x] `start.sh` (fish-only) removido. `start-universal.sh` renomeado para `start.sh` (bash universal). README e START_GUIDE atualizados.

---

## Decisões em aberto

- **Next.js 16?** A pergunta original (React puro vs Next). Hoje o backend Express + SPA Vite funciona. Migração só vale se quiser SSR pra SEO (improvável nesse caso de uso local) ou para API routes colocadas no mesmo app. **Recomendação: ficar com Vite + Express separados.**
- **Auth multi-user?** Hoje é single-user local. Se quiser compartilhar a plataforma, precisa `users` + JWT + escopar todas as queries por `user_id`.
- **Qual LLM pra geração de conteúdo?** Local (Ollama + llama3) vs API (Claude/GPT). Local é gratis mas qualidade menor; API custa mas gera melhor. Decidir antes do item 5.
