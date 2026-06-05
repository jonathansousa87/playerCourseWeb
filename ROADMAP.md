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

## Bugs e correções

### B.1. "Revisar" só deve considerar aulas já assistidas — CONCLUÍDO ✓
- [x] Filtro adicionado em `getDueCards` (`server/flashcards.js`): `EXISTS (SELECT 1 FROM step_completions sc WHERE sc.course_title = d.course_title AND sc.lesson_prefix = d.lesson_prefix)`. Cards de aulas sem nenhum step concluído não aparecem na fila de revisão.

**Por que:** revisar conteúdo que o usuário ainda nem expôs uma vez quebra o ciclo *encoding → retrieval* (não há traço de memória pra recuperar, vira leitura passiva).

### B.2. Controles de teclado do vídeo ativos fora da aba "Vídeo" — CONCLUÍDO ✓
- [x] `LessonStepper.jsx` recebe prop `onStepChange` e notifica o pai a cada mudança de aba (click, auto-avanço, reset de aula).
- [x] `activeStepRef` em `CoursePlatform.jsx` rastreia o step sem re-render; o handler de `keydown` envolve `ArrowLeft/Right/Up/Down` em `if (activeStepRef.current === 'video')` — seek e navegação de aula só disparam na aba de vídeo.
- [x] Fullscreen shortcuts (`Escape`, `F`, `Space`) permanecem globais (já estavam dentro de `if (fullscreen.isFullscreen)`).
- [x] Thread completo: `CoursePlatform` → `LessonPlayer` → `LessonGroupPlayer` → `LessonStepper`.

**Por que:** usuário tentando digitar em campos de texto ou navegar na UI aciona controles do player involuntariamente — UX quebrada em qualquer aba que não seja a de vídeo.

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

## Fase 8 — Nuvem + multi-plataforma (auth, Supabase, Drive, Android)

Bloco de mudanças que tira a plataforma do "single-user local + filesystem" e abre caminho pro app Android online. Os itens são bem acoplados — recomendado fazer na ordem 8.1 → 8.2 → 8.3 → 8.4 → 8.5, porque cada um depende do anterior.

### 8.1. Autenticação — SUBSTITUÍDA POR SUPABASE AUTH ✓
JWT próprio + tabela `users` local foram **descontinuados**. Plataforma agora usa **Supabase Auth** end-to-end (`auth.users`, signIn/signUp/signOut nativo, JWT ECC P-256, refresh automático). Detalhes na seção "Migração Supabase Auth + RLS" abaixo.

- [x] `server/auth.js`: `requireAuth` valida JWT do Supabase via JWKS público (lib `jose`). Header `Authorization: Bearer` ou query `?t=` para `<video>`.
- [x] `server/auth.supabase.js`: `verifySupabaseJWT()` usando `createRemoteJWKSet` — sem secret no servidor, valida offline com cache.
- [x] Frontend: `src/lib/supabase.js` expõe `supabase` (createClient) + `getCurrentAccessToken()` (cache sincrono atualizado via `onAuthStateChange`).
- [x] `src/contexts/AuthContext.jsx`: reescrito sobre `supabase.auth.{signIn,signUp,signOut}`, listener `onAuthStateChange`. `LoginScreen.jsx` mantido (mesma API).
- [x] `src/utils/fetchAuth.js`: interceptor pega token via `getCurrentAccessToken()`. Streaming de vídeo (`getMediaUrl`) também usa essa função.
- [x] **Removidos:** tabela `public.users`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `JWT_SECRET`, `server/routes/auth.js`, `db/reset-password.js`.

### 8.2. Materiais gerados como Markdown puro — CONCLUÍDO ✓
- [x] `buildQuizPrompt` reescrito: formato `## N. Pergunta? / - [ ] / - [x] / > Explicação` — sem HTML, sem CSS, sem JS.
- [x] `buildExemplosPrompt` reescrito: formato `## N. Conceito / **Explicação:** / blocos de código` — Markdown puro com seções por `##`.
- [x] Validação do quiz atualizada para checar `^## \d+\.` e `- [x]` em vez de `.question-card`.
- [x] `parseQuizMd` adicionado em `quizParser.js`; função `parseQuiz` auto-detecta HTML vs MD pelo conteúdo e despacha pro parser certo.
- [x] `parseExemplosMd` adicionado em `examplesParser.js`; divide por `## ` headings, cada seção vira um card.
- [x] `ExamplesViewer` e `QuizViewer`: parsers com auto-detect transparente para legado HTML e MD novo.
- [x] **Sem `.md` em disco**: superado pelo 8.3 — gerador grava direto em `lesson_materials` (banco). Flashcards via `importDeckFromContent` (sem arquivo). Backward compat HTML/`__db__` mantido para cursos legados no filesystem.

**Por que:** HTML estruturado custa ~1.5-2× mais tokens que MD pelo overhead de tags; MD é mais barato pro DeepSeek, mais portável (Android/Drive) e mais simples de armazenar como TEXT no banco.

### 8.3. Migrar Postgres local → Supabase (free tier) — CONCLUÍDO ✓
- [x] Schema aplicado no Supabase via `node db/migrate.js` com `SUPABASE_DATABASE_URL`.
- [x] `db/index.js`: SSL automático quando `DATABASE_URL` aponta para `.supabase.co`.
- [x] `db/migrate-to-supabase.js`: script Node.js que copia todas as 16 tabelas do local → Supabase, respeitando ordem de FK, truncando antes de inserir (idempotente), serializando JSONB e resetando sequences. Resultado: 10 lesson_progress, 33 step_completions, 230 flashcards, 64 reviews, 19 decks, 13 prequestions, 85 review_log etc.
- [x] `DATABASE_URL` no `.env` trocada para Supabase; `DATABASE_URL_LOCAL` mantida como fallback offline.
- [x] `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` documentados no `.env` e `.env.example` para uso futuro (Storage, Auth).
- [x] Servidor testado: "Postgres conectado." via Supabase, auth funcionando, rotas protegidas ok.
- [x] **RLS** (Row Level Security) por `user_id` — habilitado em 16 tabelas (14 user + 2 globais). 58 policies (`auth.uid() = user_id` em SELECT/INSERT/UPDATE/DELETE para tabelas de usuário; `lesson_materials` e `lesson_prequestions` apenas SELECT público para `authenticated`). Backend usa `service_role` (bypass) + filtros `user_id` manuais (defesa em profundidade). Validado: cliente Supabase JS direto com JWT do user vê só seus dados; spoof `INSERT user_id=outro` é bloqueado (42501 / WITH CHECK).
- [x] **Supabase Auth** ativo em substituição ao JWT próprio.
- [x] **Materiais no banco, não no disco**: nova tabela `lesson_materials (course_title, lesson_prefix, kind, content TEXT)` substitui arquivos `.md` no filesystem. `generator.js` salva direto no banco + apaga arquivo local. `.txt` de flashcards apagados após `importDeck`. Migração `db/migrate-files-to-db.js` processou 70 materiais / 87 arquivos apagados. Endpoint `GET /api/materials/:course/:prefix/:kind` serve o conteúdo. `courses.js` augmenta grupos com materiais do banco (`__db__` path). `buildFileUrl` em `LessonStepper` resolve `__db__` para o endpoint da API. **Supabase Storage não usado** — banco de texto é suficiente e mais simples.
- [ ] **Vídeo NÃO entra no Supabase** — confirmado; continua no filesystem/Drive.

**Por que:** habilita acesso remoto ao banco (Android app futuramente), elimina dependência do Docker para o banco em produção, free tier cobre o uso individual (DB ~5MB atualmente).

### 8.4. Consumir cursos do Google Drive (multi-usuário controlado por compartilhamento) — CONCLUÍDO ✓ (ativo em produção)

**Modelo de acesso:** owner compartilha a pasta de cursos no Google Drive com os emails permitidos (UI do próprio Drive). Servidor usa o token do owner para servir vídeos, mas verifica o email do usuário logado contra a lista de permissões do Drive antes de cada stream. Quem não está na lista recebe 403 — sem painel de admin extra.

- [x] `googleapis` instalado.
- [x] `server/drive/index.js`: cliente OAuth2 singleton + cache em memória (TTL 5min). Funções: `listFolders`, `listFilesRecursive`, `flattenFiles`, `getFileContent`, `streamFile` (Range proxy), `getSharedEmails` (lê permissões da pasta → `Set<email>`, cacheado), `findTranscriptInDrive`, `clearCache`.
- [x] `server/routes/drive.js`: `GET /api/drive/auth` (OAuth redirect), `GET /api/drive/callback` (exibe refresh_token no HTML), `GET /api/drive/status`, `POST /api/drive/cache/clear`.
- [x] `server/config.js`: `getCourseSource()` e `getDriveFolderId()`.
- [x] `server/routes/courses.js`: branch Drive em `/cursos/:file` (stream com check de email via `getSharedEmails`) e `/api/courses` (listagem retorna `[]` se email sem acesso). `buildDriveContent()` converte árvore Drive → formato de `readCourseContent` com `path = fileId`.
- [x] `server/ai/generator.js`: `loadTranscriptForLesson()` — carrega transcrição do Drive ou filesystem conforme `COURSE_SOURCE`. `chat.js` e `prequestions.js` atualizados.
- [x] `server.js`: `driveRouter` montado antes de `requireAuth`.
- [x] `src/components/ConfigModal.jsx`: seção Drive com status de conexão e botão de autorização.
- [x] `.env` preenchido com credenciais reais; `COURSE_SOURCE=drive`, `/api/drive/status` retorna `configured:true, connected:true`. Cursos do Drive aparecem na plataforma — fluxo end-to-end validado em uso real.

**Por que (multi-usuário):** owner gerencia acesso direto no Drive (share/unshare); servidor serve com token do owner mas só para emails autorizados — controle centralizado, zero painel extra.

### 8.4b. Migração para Supabase Auth + RLS — CONCLUÍDO ✓

Bloco de 9 etapas (002–005 em `db/migrations/`) aplicado para preparar terreno do app Android (que vai falar direto com Supabase via `@supabase/supabase-js`).

- [x] **Etapa 1** (`002_add_user_id.sql`): coluna `user_id UUID REFERENCES auth.users ON DELETE CASCADE` em 14 tabelas (nullable). 13 índices compostos `(user_id, ...)` criados.
- [x] **Etapa 2** (`003_backfill_user_id.sql`): backfill associando todas as linhas existentes ao usuário criado em `auth.users`. `flashcards.user_id` preenchido via JOIN com `flashcard_decks` (denormalizado pra defesa em profundidade).
- [x] **Etapa 3** (`004_user_id_not_null_and_unique.sql`): `SET NOT NULL` em todas as 14. Trocados 6 UNIQUE constraints pra incluir `user_id` (mesmo curso/aula em users diferentes não colide).
- [x] **Etapa 4 (backend auth)**: `server/auth.supabase.js` + `server/auth.js` reescritos. `requireAuth` valida JWT do Supabase via JWKS (`createRemoteJWKSet` da `jose`) — sem secret no server, cache de chave pública. `req.userId` e `req.userEmail` populados do claim.
- [x] **Etapa 5 (frontend)**: `src/lib/supabase.js` (createClient + cache sincrono de access token via `onAuthStateChange`). `AuthContext` usa `signInWithPassword`/`signUp`/`signOut`. `fetchAuth` interceptor lê `getCurrentAccessToken()`. `getMediaUrl` (vídeo) idem.
- [x] **Etapa 6 (queries)**: 10 arquivos refatorados — todas as queries filtram por `user_id` (ou usam `req.userEmail` no Drive auth). `progress.js`, `quiz.js`, `flashcards.js` (lib + route), `ia.js`, `stats.js`, `courses.js`. Funções da lib FSRS (`importDeck`, `getDeck`, `getDueCards`, `reviewCard`, `getDueSummary`) recebem `userId` obrigatório (rejeita se ausente). `flashcards.user_id` e `flashcard_review_log.user_id` denormalizados (consistência via JOIN no `reviewCard`'s ownership check).
- [x] **Etapa 7 (RLS)** (`005_enable_rls.sql`): RLS ON em 16 tabelas. **58 policies** geradas via DO block dinâmico — 14×4 (SELECT/INSERT/UPDATE/DELETE com `auth.uid() = user_id`) + 2×1 (lesson_materials/lesson_prequestions com SELECT TO authenticated USING true). Backend continua via `service_role` (bypass).
- [x] **Etapa 8 (smoke multi-user)**: validado que cliente Supabase JS direto com JWT do user só vê seus dados; spoof `INSERT user_id=outro` é bloqueado com Postgres erro 42501 (insufficient_privilege). Confirma isolamento futuro do app Android.
- [x] **Etapa 9 (limpeza)**: deletados `server/routes/auth.js`, `db/reset-password.js`. Removidos `bcryptjs`, `jsonwebtoken`, `cookie-parser` do `package.json`. Apagados `JWT_SECRET` do `.env` e `cookieParser`/`cookies` do `server.js`/`auth.js`. Tabela `public.users` dropada (sem FKs apontando). `db/schema.sql` atualizado (sem CREATE TABLE users). 91/91 testes passando.

**Sistema de migrations versionadas**: novo `db/migrate-versioned.js` rastreia em `schema_migrations (filename, applied_at)`, aplica idempotente. Migrations em `db/migrations/*.sql` (cada arquivo numerado, sem BEGIN/COMMIT — runner controla a transação).

**Atenção / lição aprendida:** `ON DELETE CASCADE` na FK pra `auth.users` significa que **excluir um usuário no dashboard apaga todas as linhas associadas** — não há trigger de "soft delete". Pra dev, é o que se quer; em prod, considerar `ON DELETE RESTRICT` + script de exportação antes de deletar usuários.

**Por que (multi-tenant):** RLS é a base que permite o RN abrir o `@supabase/supabase-js` direto, sem passar pelo Express, e ainda assim cada device só ver dados do seu user. Combinado com a permissão Drive-by-email, fecha o modelo multi-usuário sem painel de admin extra.

### 8.5. App Android nos mesmos moldes da plataforma — EM ANDAMENTO

**Decisão de stack:** React Native + Expo — projeto em `~/Documentos/playerCourseApp`.
**Decisão de storage:** Supabase direto (sem SQLite offline) — o usuário acessa de outro dispositivo na mesma conta, sem necessidade de sync offline.
**Decisão de arquitetura:** App **totalmente autônomo** — fala direto com Supabase, Google Drive e DeepSeek. **NÃO depende do servidor Express** (que só roda em casa quando o PC está ligado). Funciona de qualquer rede.

**Credenciais via DB (`user_settings`):** todas as credenciais (Google OAuth, DeepSeek API key, Drive folder ID) ficam na tabela `user_settings` do Supabase, configuradas pela UI de "Configurações" do web app. App mobile lê de lá com RLS — sem `.env` no bundle.

- [x] Stack: **React Native + Expo** (blank template, SDK 53).
- [x] Auth: `@supabase/supabase-js` + `expo-secure-store` (sessão persistida de forma segura). `AuthContext` idêntico ao web.
- [x] FSRS client-side: `ts-fsrs` portado em `src/lib/fsrs.js` — replica exatamente `reviewCard` do servidor (mesmos params, upsert `flashcard_reviews` + insert `flashcard_review_log` direto no Supabase via RLS).
- [x] RPCs no Supabase (`migration 007`): `get_due_cards(limit)`, `get_courses()`, `get_lessons(course_title)` — queries complexas com JOIN executadas no banco, não no cliente.
- [x] Tela **Login**: email + senha, validação, feedback de erro.
- [x] Tela **Revisar** (tab): fila FSRS, captura de confiança antes do flip (hypercorrection), ratings 1-4, progresso visual, tela de conclusão.
- [x] Tela **Cursos** (tab): lista com badge de cards vencidos por curso.
- [x] Tela **Aulas**: materiais disponíveis por aula (resumo/quiz/exemplos/flashcards/diário/piada) com ícones, steps concluídos.
- [x] Tela **Material**: renderiza markdown do Supabase com `react-native-markdown-display` (tema escuro consistente com o web).
- [x] Bundle Android buildado sem erros (921 módulos, 2.85 MB).
- [x] **Cliente Drive direto** (`src/lib/drive.js`): OAuth refresh-token flow + listFolders/listFilesRecursive/getFileText/getStreamUrl. Cache 5min. Detecção e parse de transcrições .txt/.vtt.
- [x] **Cliente DeepSeek direto** (`src/lib/deepseek.js`): chamada REST com api key do `user_settings`.
- [x] **Prompts portados** (`src/lib/prompts.js`): builders de resumo, quiz, exemplos, flashcards, diario, piada — espelho do servidor.
- [x] **Generator** (`src/lib/generator.js`): pipeline completo Drive transcript → DeepSeek → Supabase (`lesson_materials` ou `flashcard_decks`).
- [x] **Tela Cursos**: lista cursos do Drive + materiais existentes do Supabase.
- [x] **Tela Aulas**: navegação por aula, badges de materiais, modal "Gerar IA" funcional.
- [x] Migração 008 + UI de "Credenciais da plataforma" no `ConfigModal` do web — credenciais salvas no Supabase consumidas pelo mobile.
- [ ] Notificações pré-sono: `expo-notifications` agendadas com base em `user_profile.bestHour - 4h`.
- [ ] Distribuição: APK via EAS Build → Internal Testing no Play Console.

**Por que:** ler/revisar no celular fecha o ciclo (revisão pré-sono real, intervalos de fila, deslocamento). Vídeo continua no Drive (não duplica custo); só os materiais leves (`.md` + flashcards + progresso) trafegam.

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

## Fase 9 — UX visual e onboarding completo

Polimento de superfície e fechamento de buracos no fluxo de auth. Itens 9.1 e 9.2 são puramente client-side; 9.3-9.5 dependem de configuração no painel Supabase (email templates + redirectTo URL).

### 9.1. Sistema de temas com paletas baseadas em neurociência — EM ANDAMENTO
- [ ] CSS variables centralizadas em `src/index.css` para 3 temas: `petrol` (azul-petróleo + accent teal/âmbar — recomendação literatura de leitura prolongada), `forest` (verde-musgo + sage), `slate` (atual refinado).
- [ ] `src/contexts/ThemeContext.jsx` aplica `data-theme` no `<html>`, persiste em `localStorage` (`pcw.theme`), default `petrol`.
- [ ] Seletor de tema na `ConfigModal` com preview visual (chip colorido) e descrição curta de cada paleta.
- [ ] `index.css` define variáveis `--bg`, `--surface`, `--surface-2`, `--surface-hover`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-soft` por tema. Componentes-chave passam a referenciar via classes Tailwind arbitrárias (`bg-[var(--bg)]`).
- [ ] Refinamento de opacidades/sombras em todos os modais (`AIGenerateModal`, `BulkAIGenerateModal`, `ConfigModal`, `LoginScreen`) para visual mais coeso e elegante.

**Por que (neurociência aplicada à interface):** comprimentos de onda azul-esverdeados de baixa saturação reduzem fadiga ocular em leitura prolongada (Sheedy 2003); contraste suave com background não-puro-preto evita "halation" e relaxa músculos ciliares; accents quentes (âmbar) em CTAs reduzem o efeito de "alarme" do azul saturado puro. Manter slate puro como opção respeita preferência cognitiva individual.

### 9.2. Menu de aula/materiais reformulado — EM ANDAMENTO
- [ ] `LessonStepper.jsx`: substituir botões individuais por **segmented control** com indicador deslizante, ícones Lucide consistentes (substituir emojis quando possível) e estados hover/active mais sutis.
- [ ] `BulkAIGenerateModal.jsx`: tipos de material todos pré-selecionados por padrão (`new Set(KIND_OPTIONS.map(k => k.key))`) — usuário desmarca o que não quer em vez de marcar tudo.

**Por que:** menos clicks no fluxo mais comum (gerar tudo). Lei de Hick: reduzir tempo de decisão pré-selecionando o caso esperado.

### 9.3. Cadastro com nome completo — EM ANDAMENTO
- [ ] `LoginScreen.jsx`: campo "Nome" obrigatório quando `mode === 'register'`, mínimo 2 caracteres.
- [ ] `AuthContext.register(email, password, fullName)` passa `{ data: { full_name } }` em `signUp.options` — populando `auth.users.raw_user_meta_data`.
- [ ] Sem migração de schema: usa metadata nativa do Supabase, acessível via `user.user_metadata.full_name`.

### 9.4. Confirmação de email após cadastro — EM ANDAMENTO
- [ ] Após `signUp` bem-sucedido (e antes de session ativa), `LoginScreen` muda para estado `mode='verify'` mostrando: "Enviamos um email para X. Verifique sua caixa de entrada e clique no link para ativar a conta." + botão "Reenviar email" (chama `supabase.auth.resend({ type: 'signup', email })`) + link "Voltar para login".
- [ ] **Configuração manual no painel Supabase**: Authentication → Providers → Email → "Confirm email" ativado. Sem isso, cadastro continua autologin.
- [ ] Email template default do Supabase é OK (pt-BR opcional editar).

### 9.5. Reset de senha — EM ANDAMENTO
- [ ] `LoginScreen`: link "Esqueci minha senha" no modo login → muda para `mode='forgot'` com input de email + botão "Enviar link de redefinição" (chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: <APP_URL>/?reset=1 })`).
- [ ] `App.jsx`: listener em `onAuthStateChange` detecta evento `'PASSWORD_RECOVERY'` e troca para `<ResetPasswordScreen />`.
- [ ] Novo `src/components/ResetPasswordScreen.jsx`: form com nova senha + confirmação, chama `supabase.auth.updateUser({ password })`. Sucesso → redireciona para login.
- [ ] **Configuração manual no painel Supabase**: Authentication → URL Configuration → "Site URL" e "Redirect URLs" precisam incluir o domínio do app (em dev: `http://localhost:5173`).

**Por que:** sem fluxo de reset o usuário fica preso ao perder a senha — friction crítico em qualquer plataforma de uso recorrente.

---

## Decisões em aberto

- **Next.js 16?** A pergunta original (React puro vs Next). Hoje o backend Express + SPA Vite funciona. Migração só vale se quiser SSR pra SEO (improvável nesse caso de uso local) ou para API routes colocadas no mesmo app. **Recomendação: ficar com Vite + Express separados.**
- ~~**Auth próprio vs Supabase Auth?**~~ — **decidido**: Supabase Auth (item 8.4b).
- **`pg` direto vs `@supabase/supabase-js` no backend?** Manter `pg` apontando pra `DATABASE_URL` do Supabase é o caminho de menor refactor (queries existentes funcionam iguais). RLS resolve a parte de autorização sem precisar do client JS.
- **Stack do app Android: Expo (RN) vs Kotlin nativo?** Expo reaproveita ~70% do JS atual e libera MVP em semanas; Kotlin dá UX nativa melhor mas é retrabalho total. **Recomendação:** começar Expo, migrar pra nativo só se houver dor real de performance.
- **HTML legado nos cursos atuais (item 8.2):** manter parser de fallback para `_quiz_*.html` e `_exemplos_*.html` por 1-2 ciclos ou regenerar tudo de uma vez via IA? Regerar é mais limpo mas custa tokens — fazer um script "regenerate-all" opcional.
