# Player Course Web

Plataforma local de estudo construída em torno de um princípio: **assistir aula não é estudar**. O app combina player de vídeo, geração automática de material de apoio com IA (resumo, quiz, flashcards) e revisão espaçada (FSRS) — tudo rodando offline contra um Postgres local, com seus arquivos de curso na sua máquina.

Pensada pra quem tem dezenas de cursos baixados e quer transformar consumo passivo em fixação ativa.

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Pré-requisitos](#pré-requisitos)
- [Setup passo a passo](#setup-passo-a-passo)
- [Estrutura esperada da pasta de cursos](#estrutura-esperada-da-pasta-de-cursos)
- [Como usar](#como-usar)
- [Atalhos de teclado](#atalhos-de-teclado)
- [Endpoints da API](#endpoints-da-api)
- [Arquitetura](#arquitetura)
- [Desenvolvimento](#desenvolvimento)
- [Troubleshooting](#troubleshooting)

---

## Funcionalidades

### Player e navegação
- Player de vídeo customizado com seek, velocidade (1x–1.75x), fullscreen, navegação por teclado
- Detecta arquivos complementares de cada aula (`.vtt`, `_resumo`, `_quiz`, `_flashcards`, `_diario`, `_exemplos`) e agrupa num "lesson group" com stepper único
- Suporte a vídeo (MP4, WEBM, MKV, M3U8), PDF, HTML, Markdown
- Layout adaptativo (full-width em telas grandes; legibilidade preservada em texto)
- Sidebar deslizante com lista de aulas, expansão automática do módulo da aula atual

### Fixação (neurociência aplicada)
- **FSRS** (Free Spaced Repetition Scheduler) para flashcards. Ratings 1–4 (Errei / Difícil / Bom / Fácil), agendamento adaptativo por card
- Tela **"Revisar"** global agrega cards vencidos de todos os cursos
- **Quiz com tracking**: passo só conta como concluído com acerto ≥ 70%; questões erradas viram flashcards extras automaticamente no deck FSRS da aula
- **Pomodoro adaptativo**: duração do foco ajusta com base em acerto recente (< 60% → 20min, 60-85% → 25min, > 85% → 45min). No fim do ciclo, oferece revisar 5 cards (active recall) ou pausa passiva
- **Diário técnico** por aula e **resumo pessoal** (editor markdown)
- **Diário semanal** por curso com prompt automático

### IA opcional (DeepSeek)
- Botão "Gerar IA" por aula ou em lote para o curso inteiro
- Usa a transcrição `.vtt` da aula como única fonte de verdade
- Gera resumo, quiz, flashcards, exemplos e diário em um único arquivo `_ia` no mesmo diretório da aula
- Flashcards gerados entram direto no deck FSRS com dedup por `front+back`
- **Chat IA por aula** (FAB flutuante): tire dúvidas em conversas multi-turn; histórico persistido em Postgres por aula

### Dashboard
- Heatmap de consistência (90 dias): reviews + pomodoros por dia
- Curva de retenção rolling 7d/30d por curso
- Top cards com mais lapsos
- ETA pra zerar backlog (cards vencidos ÷ ritmo médio 14d)
- **Perfil cognitivo**: streak, hora ótima/fraca do dia, drift de dificuldade (D médio recente vs anterior), totais
- **Cards confusos**: grupos de enunciados semanticamente similares (Jaccard + union-find) lado a lado para diferenciar conceitos próximos
- **Badge de acerto por módulo** + banner sugerindo revisão quando acerto cai abaixo de 60%

---

## Stack

- **Frontend**: React 18 + Vite 6 + Tailwind CSS 3 + react-markdown + lucide-react
- **Backend**: Node.js 18+ + Express 4 (rotas separadas em `server/routes/*.js`)
- **Database**: PostgreSQL 16 via Docker Compose
- **FSRS**: `ts-fsrs` (algoritmo no servidor, estado persistido em SQL)
- **IA**: DeepSeek API v3 (`deepseek-chat` por padrão)
- **Testes**: Vitest 4 + happy-dom (59 testes cobrindo parsers, FSRS e similaridade semântica)

---

## Pré-requisitos

| Ferramenta | Versão mínima | Observação |
|---|---|---|
| Node.js | 18.x | Recomendado 20.x LTS |
| npm | 9.x | Vem com o Node |
| Docker | 20.x | Pra subir o Postgres |
| Docker Compose | v2 | `docker compose` (não `docker-compose`) |

A chave da DeepSeek API é **opcional** — só é necessária para "Gerar IA" e o chat. Sem ela, o resto da plataforma (player, FSRS, dashboard) funciona normalmente.

Se quiser uma chave: https://platform.deepseek.com/api_keys (~$5 inicial cobre milhares de gerações; resumo de aula custa ~$0.003).

---

## Setup passo a passo

### 1. Clonar o repositório

```bash
git clone <url-do-repo> playerCourseWeb
cd playerCourseWeb
```

### 2. Instalar dependências do Node

```bash
npm install
```

### 3. Configurar variáveis de ambiente

Copie o exemplo:

```bash
cp .env.example .env
```

Edite `.env`:

```env
# Conexão com o Postgres local (porta 5433 pra não bater com instalação nativa)
DATABASE_URL=postgres://playercourse:playercourse_dev@localhost:5433/playercourse

# Porta do backend Express
PORT=3001

# Caminho ABSOLUTO da pasta onde estão suas pastas de curso (cada subpasta = 1 curso)
COURSES_PATH=/caminho/absoluto/para/seus/cursos/

# Opcional — só precisa se quiser usar "Gerar IA" e o chat com IA
DEEPSEEK_API_KEY=
```

> **Atenção:** `COURSES_PATH` precisa terminar com `/`. Pode ser alterado em runtime pelo botão Config no UI; o valor do `.env` é só o default inicial.

### 4. Subir o Postgres

```bash
docker compose up -d
```

Isso sobe um Postgres 16 na porta `5433` com o schema (`db/schema.sql`) aplicado automaticamente na primeira subida. Os dados ficam num volume Docker (`playercourse_pgdata`) que persiste entre `up`/`down`.

Pra checar:

```bash
docker compose ps
docker compose logs postgres
```

Pra reaplicar migrations manualmente (depois de mudanças no `schema.sql`):

```bash
npm run db:migrate
```

### 5. Rodar a aplicação

**Linux/Mac:**

```bash
./start.sh
```

**Windows:**

```cmd
start.bat
```

O script verifica Node/NPM, sobe backend (`:3001`) e frontend (`:5173`) em paralelo, e mata ambos no `Ctrl+C`.

**Alternativa manual** (dois terminais):

```bash
# Terminal 1
npm run server

# Terminal 2
npm run dev
```

### 6. Abrir no navegador

http://localhost:5173

Na primeira vez, clique em **Config** (canto superior direito) e ajuste o caminho dos cursos se diferente do `.env`. Os cursos aparecem na home.

---

## Estrutura esperada da pasta de cursos

O backend escaneia `COURSES_PATH` recursivamente. Cada subpasta direta vira um **curso**, e dentro dela cada subpasta vira um **módulo**.

Arquivos de aula são reconhecidos pelas extensões `.mp4 .webm .ts .m3u8 .mkv .pdf .html .md .txt`.

### Lesson groups (recomendado)

Quando uma aula tem material complementar, eles são agrupados pelo prefixo do nome. Sufixos reconhecidos:

| Sufixo | Tipo |
|---|---|
| `_dub.mp4` (ou `.webm`, `.mkv`, etc.) | vídeo |
| `_resumo_dub_NN.md` | resumo |
| `_exemplos_dub_NN.html` | exemplos |
| `_quiz_dub_NN.html` | quiz |
| `_flashcards_anki_dub_NN.txt` | flashcards |
| `_diario_tecnico_dub_NN.md` | diário técnico |
| `*_dub.vtt` | transcrição (usada pelo "Gerar IA" e Chat) |

`_ia` é opcional antes da extensão e indica que o arquivo foi gerado pela IA (tem prioridade quando ambos existem).

**Exemplo concreto** — pasta de uma aula:

```
Curso de Banco de Dados/
├── 02 - Modelagem/
│   ├── 36.-Introduction-716K_dub.mp4
│   ├── 36.-Introduction-716K_dub.vtt
│   ├── 36.-Introduction-716K_resumo_dub_01.md
│   ├── 36.-Introduction-716K_quiz_dub_01.html
│   ├── 36.-Introduction-716K_flashcards_anki_dub_01.txt
│   └── 36.-Introduction-716K_diario_tecnico_dub_01.md
```

O app agrupa tudo isso num único item "36. Introduction-716K" com stepper de Vídeo / Resumo / Quiz / Flashcards / Diário.

### Aulas avulsas (legacy)

Arquivos sem material complementar (ex.: vídeos antigos sem transcrição) aparecem como aulas individuais na lista, sem stepper. Funcionam para assistir, mas não dá pra "Gerar IA" (que precisa de `.vtt`).

---

## Como usar

### Fluxo recomendado

1. **Assistir** o vídeo da aula
2. Quando acabar, clicar **"Gerar IA"** (precisa da DeepSeek API key) — em ~15-30s gera resumo + quiz + flashcards + diário
3. Ler o **Resumo** (aba)
4. Fazer o **Quiz** — questões erradas viram flashcards extras automaticamente
5. **Flashcards** já estão no deck FSRS; dá rating 1-4 conforme dificuldade
6. **Meu Resumo** (aba): escrever síntese pessoal com suas palavras (importante pra fixação)
7. No dia seguinte (ou quando a tela "Revisar" sinalizar), clicar **Revisar** na home → revisão espaçada com FSRS

### Geração em lote

Na lista de aulas do curso, botão **"Gerar IA"** acima da lista abre o modal de geração em lote: marca várias aulas, escolhe quais tipos de material gerar e a IA processa todas em sequência.

### Pomodoro

Inicia automaticamente quando você dá play num vídeo. No fim do ciclo, oferece revisar 5 cards vencidos (active recall na pausa) ou pausa passiva. Duração do foco se adapta ao seu acerto recente.

### Chat com IA

Botão flutuante azul no canto inferior direito da tela da aula. Conversa multi-turn com a IA usando a transcrição como contexto. Histórico persistido por aula no Postgres — sincroniza entre dispositivos.

---

## Atalhos de teclado

Funcionam quando uma aula está aberta:

| Tecla | Ação |
|---|---|
| Espaço | Play / Pause |
| ← / → | Retroceder / avançar 10s |
| ↑ / ↓ | Aula anterior / próxima |
| F | Fullscreen |
| Esc | Sair do fullscreen |

No quiz, durante uma revisão de flashcards, ou no chat IA, os atalhos são desabilitados pra não conflitar com inputs.

---

## Endpoints da API

Resumo dos endpoints expostos pelo Express. Todos sob `http://localhost:3001`.

### Cursos e arquivos
- `GET /cursos/:file` — streaming de arquivos da pasta de cursos (com suporte a Range pra vídeo)
- `GET /api/courses` — lista cursos com módulos e aulas
- `GET /api/config/courses-path` / `POST` — ler/alterar caminho dos cursos em runtime
- `GET /api/video-durations` / `POST` / `PUT` — cache de durações de vídeos

### Progresso
- `GET /api/progress/all` — snapshot de progresso de todos os cursos
- `GET/POST/DELETE /api/progress/:course/lessons` — aulas concluídas
- `GET/POST/DELETE /api/progress/:course/steps` — etapas concluídas dentro da aula

### Notas e diários
- `GET/POST /api/db/notes/:course/pessoal` — resumo pessoal
- `GET/POST /api/db/notes/:course/pomodoro` — sessões de pomodoro
- `GET/POST /api/db/diary/:course` — diário semanal
- `GET/POST /api/db/diary-tecnico/:course/:prefix` — diário técnico por aula

### Flashcards e FSRS
- `POST /api/flashcards/:course/:prefix/import` — (re)importa deck do `.txt`
- `GET /api/flashcards/:course/:prefix` — lista cards + estado FSRS do deck
- `GET /api/flashcards/due?courseTitle=&limit=` — cards vencidos
- `GET /api/flashcards/summary` — total/due por curso
- `GET /api/flashcards/confusion?courseTitle=&minLapses=` — grupos de cards similares
- `POST /api/flashcards/review/:cardId` — registra rating 1-4

### Quiz
- `GET/POST /api/quiz/:course/:prefix/attempts` — histórico de tentativas
- `POST /api/quiz/:course/:prefix/wrong-to-flashcards` — converte erradas em cards

### Estatísticas
- `GET /api/stats/recent` — acerto 7d (alimenta Pomodoro adaptativo)
- `GET /api/stats/dashboard` — heatmap, retenção, top lapsos, backlog
- `GET /api/stats/profile` — perfil cognitivo (streak, hora, drift, totais)
- `GET /api/stats/lesson-accuracy/:course?days=` — acerto por aula

### IA
- `POST /api/ia/generate` — gera material da aula via DeepSeek
- `POST /api/ia/chat` — envia mensagem nova ao chat (carrega histórico do DB)
- `GET /api/ia/chat/:course/:prefix` — histórico do chat
- `DELETE /api/ia/chat/:course/:prefix` — limpa histórico

### Saúde
- `GET /api/db/health` — `{ ok: true }` se Postgres respondeu

---

## Arquitetura

```
playerCourseWeb/
├── server.js                       # Bootstrap Express: middleware + app.use routers
├── server/
│   ├── config.js                   # get/set de COURSES_PATH (mutável em runtime)
│   ├── flashcards.js               # FSRS scheduler + importDeck + reviewCard
│   ├── flashcardParser.js          # Parser robusto Anki (4 formatos suportados)
│   ├── semanticConfusion.js        # Tokenize PT-BR + Jaccard + union-find
│   ├── ai/
│   │   ├── deepseek.js             # Cliente HTTP com timeout 120s
│   │   ├── prompts.js              # Prompts pra resumo/quiz/flashcards/diário/exemplos
│   │   ├── generator.js            # Pipeline: vtt -> LLM -> arquivo no disco
│   │   └── chat.js                 # Chat multi-turn com transcrição como contexto
│   └── routes/
│       ├── courses.js              # Listagem + streaming + video-durations + config
│       ├── notes.js                # Notas filesystem legacy
│       ├── progress.js             # Progress + notas DB + diary + migrate
│       ├── flashcards.js           # import/due/summary/confusion/review
│       ├── quiz.js                 # attempts + wrong-to-flashcards
│       ├── stats.js                # recent + dashboard + profile + accuracy
│       └── ia.js                   # generate + chat
├── db/
│   ├── schema.sql                  # 12 tabelas (lesson_progress, flashcard_*, ...)
│   ├── migrate.js                  # Aplica schema idempotente
│   └── index.js                    # Pool pg
├── src/
│   ├── components/
│   │   ├── CoursePlatform.jsx      # Orquestração: hooks, state, routing de view
│   │   ├── CoursesScreen.jsx       # Home (header + stats + grid)
│   │   ├── LessonsView.jsx         # Lista de aulas + banner de revisão
│   │   ├── LessonPlayer.jsx        # Decide modo: stepper / HTML+PDF / video legacy
│   │   ├── LessonStepper.jsx       # Tabs Video/Resumo/Quiz/etc.
│   │   ├── VideoPlayer.jsx         # Custom video element + controls
│   │   ├── MarkdownViewer.jsx      # Renderer com design de leitor
│   │   ├── QuizViewer.jsx          # Quiz com tracking + envio de erradas
│   │   ├── ExamplesViewer.jsx      # Cards de exemplos
│   │   ├── FlashcardViewer.jsx     # Revisão FSRS por aula
│   │   ├── DailyReview.jsx         # Revisão global de todos os cursos
│   │   ├── Dashboard.jsx           # Heatmap, retenção, perfil, confusão
│   │   ├── PomodoroTimer.jsx       # Timer adaptativo + active recall
│   │   ├── LessonChat.jsx          # UI do chat
│   │   ├── ChatFAB.jsx             # Botão flutuante + painel
│   │   ├── AIGenerateModal.jsx     # Modal "Gerar IA" por aula
│   │   ├── BulkAIGenerateModal.jsx # Modal "Gerar IA" em lote
│   │   └── ...                     # ConfigModal, TechnicalDiary, etc.
│   ├── hooks/
│   │   ├── useCourseData.js        # Lista de cursos + cache de durações
│   │   ├── useCourseProgress.js    # Sync com Postgres (lessons + steps)
│   │   ├── useVideoPlayer.js       # State do player
│   │   ├── useFullscreen.js        # API de fullscreen
│   │   ├── useSidebar.js           # Posição/visibilidade da sidebar
│   │   └── useLessonAccuracy.js    # Acerto agregado por aula
│   └── utils/
│       ├── courseUtils.js          # Flatten/find/count + countWeakModules
│       ├── quizParser.js           # Parser HTML do quiz
│       ├── examplesParser.js       # Parser HTML dos exemplos
│       ├── progressApi.js          # Helpers fetch pra todos endpoints
│       └── fileUtils.jsx           # isVideoFile, isPDFFile, isHTMLFile, formatTime
├── docker-compose.yml              # Postgres 16 + volume + healthcheck
├── eslint.config.js                # Flat config (zero erros)
├── tailwind.config.cjs
├── vite.config.js
└── ROADMAP.md                      # Histórico do plano + decisões em aberto
```

---

## Desenvolvimento

```bash
npm run dev          # Frontend Vite em :5173 com HMR
npm run server       # Backend Express em :3001
npm run build        # Build de produção em dist/
npm run preview      # Servir dist/ pra testar build

npm test             # Roda todos os testes (vitest run)
npm run test:watch   # Vitest em watch mode

npm run lint         # ESLint (zero erros, ~13 warnings de estilo)

npm run db:migrate   # Aplica schema.sql (idempotente)
```

### Testes

59 testes cobrem:

- `server/flashcardParser.js` — parser dos 4 formatos de flashcard (tab, `<b>`, multi-espaço, "P: R")
- `server/semanticConfusion.js` — tokenização PT-BR, Jaccard, union-find, ordenação por lapsos
- `server/flashcards.js` — FSRS reviewCard (rating map, novo vs existente, lapses), getDueCards, importDeck (dedup, recursão, prioridade `_ia`) — DB e fs mockados
- `src/utils/quizParser.js` — extração de questões + opções + explicação (happy-dom)
- `src/utils/examplesParser.js` — cards com h1/h2 + preserva HTML interno (happy-dom)

### Schema do banco

12 tabelas, todas em `db/schema.sql`:

- `lesson_progress`, `step_completions` — progresso
- `personal_notes`, `pomodoro_sessions`, `weekly_diaries`, `technical_diary_notes` — notas e reflexões
- `flashcard_decks`, `flashcards`, `flashcard_reviews`, `flashcard_review_log` — FSRS
- `quiz_attempts` — tentativas de quiz
- `lesson_chats` — histórico de chat por aula

---

## Troubleshooting

### "ERR_CONNECTION_REFUSED" ou "Postgres indisponível"

```bash
docker compose ps              # confirma que o container está up
docker compose logs postgres   # vê o erro
docker compose restart postgres
```

Se o volume corrompeu (raro), `docker compose down -v` apaga e recria — **destrói os dados**.

### "Diretório de cursos não encontrado"

O caminho em `COURSES_PATH` (no `.env` ou no UI) não existe ou não tem permissão de leitura. Confira com `ls -la` e ajuste.

### Porta 3001 ou 5173 ocupada

```bash
# Linux/Mac
lsof -i :3001
lsof -i :5173
# Mata o processo: kill -9 <pid>
```

Pra trocar de porta, ajuste `PORT=` no `.env` (backend) ou `vite.config.js` `server.port` (frontend).

### "DEEPSEEK_API_KEY não configurada"

Sem chave, "Gerar IA" e o chat IA não funcionam — o resto da app sim. Pra obter: https://platform.deepseek.com/api_keys

### "transcrição .vtt não encontrada"

A IA precisa do `.vtt` pra gerar material e responder no chat. Soluções:
- Gerar `.vtt` com Whisper (`whisper input.mp4 --output_format vtt`)
- Baixar com `yt-dlp --write-auto-subs --sub-lang pt --convert-subs vtt`
- Manter o nome com sufixo `_dub.vtt` (ex: `aula01_dub.vtt`) pro app reconhecer

### Flashcards com 0 cards depois de gerar

A IA pode ter gerado em formato fora do padrão. O parser tolera 4 formatos (tab, `<b>`, multi-espaço, "P: R"), mas se mesmo assim sair vazio, o backend retorna erro `Flashcards: apenas X cards parseados (mínimo 3)` — re-gere a aula. Se acontecer várias vezes seguidas, abra o `.txt` gerado pra inspecionar.

### Build do frontend gigante (>500kB)

Já há tree-shaking. Os bundlers principais são `react-markdown` + `lucide-react` + `react-collapsible`. Pra reduzir, dá pra trocar `lucide-react` por imports individuais (`import X from 'lucide-react/dist/esm/icons/x'`) — não foi feito porque o impacto na DX não compensa.

### Reset de progresso

Pra começar do zero (perde **TUDO**: progresso, flashcards, reviews, chats):

```bash
docker compose down -v   # apaga o volume Postgres
docker compose up -d     # recria com schema novo
```

---

## Roadmap e decisões em aberto

Veja [ROADMAP.md](./ROADMAP.md) para o estado atual de features e débito técnico.

Decisões pendentes documentadas:
- Migração para Next.js (recomendação: ficar com Vite + Express)
- Auth multi-user (hoje single-user local)
- LLM local (Ollama) vs API paga (DeepSeek é o atual)

---

## Licença

Uso pessoal. Adicione uma licença explícita antes de distribuir.
