# Player Course Web

> Plataforma local de estudo que transforma cursos em vídeo numa rotina de fixação ativa: assistir → gerar material com IA → revisar com repetição espaçada → consolidar com active recall. Tudo offline, contra Postgres local, com seus arquivos na sua máquina.

[![Vitest](https://img.shields.io/badge/tests-59%20passing-brightgreen)]()
[![Lint](https://img.shields.io/badge/lint-0%20errors-brightgreen)]()
[![Stack](https://img.shields.io/badge/stack-React%20%2B%20Express%20%2B%20Postgres-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933)]()

---

## Por que existe

A pesquisa em ciência da aprendizagem é inequívoca em três pontos:

1. **Assistir aula é consumo passivo.** Sem reativação espaçada, ~70% do conteúdo é esquecido em 24h (curva de esquecimento de Ebbinghaus).
2. **Active recall** (testar-se vs. reler) é 2-3× mais eficiente do que releitura para retenção de longo prazo.
3. **Spaced repetition** com agendamento adaptativo (FSRS, SM-2) reduz tempo de estudo em até 70% para o mesmo nível de retenção.

A plataforma operacionaliza esses três princípios sobre o material que você já tem (cursos baixados em vídeo). Diferente do Anki (deck-centric, montagem manual) ou de plataformas de cursos (consumo linear sem fixação), o app **acopla o vídeo à revisão**: cada aula vira automaticamente uma unidade de estudo com resumo, quiz, flashcards e diário, e o progresso de retenção alimenta um dashboard que te diz exatamente o que revisar e quando.

**Não é** uma plataforma SaaS. **É** um app local: sem login, sem servidor remoto, sem rastreamento. Tudo roda contra um Postgres na sua máquina.

---

## Sumário

- [Demonstração rápida](#demonstração-rápida)
- [Funcionalidades](#funcionalidades)
- [Arquitetura em alto nível](#arquitetura-em-alto-nível)
- [Stack](#stack)
- [Pré-requisitos](#pré-requisitos)
- [Setup completo](#setup-completo)
- [Estrutura esperada da pasta de cursos](#estrutura-esperada-da-pasta-de-cursos)
- [Como usar — fluxo do estudante](#como-usar--fluxo-do-estudante)
- [Atalhos de teclado](#atalhos-de-teclado)
- [Endpoints da API](#endpoints-da-api)
- [Schema do banco](#schema-do-banco)
- [Estrutura do código](#estrutura-do-código)
- [Algoritmos](#algoritmos)
- [Desenvolvimento](#desenvolvimento)
- [Testes](#testes)
- [Performance](#performance)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Glossário](#glossário)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

---

## Demonstração rápida

```
┌─────────────────────────────────────────────────────────┐
│  Meus Cursos              [Dashboard] [Revisar] [Config]│
├─────────────────────────────────────────────────────────┤
│  Progresso geral ███████░░░░░░░░░░  142 / 380 aulas     │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Java     │ │ Postgres │ │ React    │ │ DDD      │   │
│  │ ▓▓▓░░ 45%│ │ ▓▓▓▓▓ 92%│ │ ▓░░░░ 12%│ │ ▓▓░░░ 28%│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                         │
│  ⚠ 2 módulos com acerto < 60%        [Revisar agora]    │
└─────────────────────────────────────────────────────────┘
```

Dentro de uma aula:

```
[← Voltar]  Aula 36: Modelagem    [▶ Video] [📄 Resumo ✓] [❓ Quiz ✓]
                                  [💡 Exemplos] [🔁 Flashcards] [✏️ Pessoal]
                                                          [Gerar IA] 5/6
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              ▶ Vídeo da aula (24:32)                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
[●●●●○○○○○○ 12:14 / 24:32]  [1x] [1.25x] [1.5x] [Tela cheia]

                                            (💬 chat IA flutuante)
```

---

## Funcionalidades

### Player e navegação

- Player de vídeo customizado: seek por arrastar, velocidade 1×/1.25×/1.5×/1.75×, volume, fullscreen
- Detecção automática de **lesson groups**: arquivos com mesmo prefixo agrupam num único stepper (vídeo + resumo + exemplos + quiz + flashcards + diário + meu resumo)
- Suporte a vídeo (MP4, WEBM, MKV, M3U8, TS), PDF, HTML, Markdown
- Sidebar deslizante com hover (lista de aulas), expansão automática do módulo da aula ativa
- Layout adaptativo: full-width em monitores grandes, grid de cursos vai de 1 a 5 colunas progressivamente
- Navegação por teclado completa
- Cache de durações de vídeo persistido em arquivo local

### Fixação (ativa, mensurável, adaptativa)

| Recurso | O que faz | Por que importa |
|---|---|---|
| **FSRS** | Agendamento individual por card baseado em estabilidade + dificuldade | 2-3× mais eficiente que SM-2 e Anki padrão |
| **Tela "Revisar"** | Agrega cards vencidos de TODOS os cursos | Sessões mistas combatem interferência |
| **Quiz tracking** | Score ≥ 70% pra concluir; questões erradas viram cards | Fecha o loop teste → erro → reforço |
| **Pomodoro adaptativo** | Foco escala com acerto recente (20-45min); pausa pode ser ativa (5 cards) | Active recall durante a pausa fixa o que acabou de estudar |
| **Diário técnico** + **Meu Resumo** | Editor markdown inline por aula | Síntese com palavras próprias é o ponto alto da retenção |
| **Diário semanal** | Prompt automático após 7 dias | Reflexão metacognitiva (o que aprendi, o que faria diferente) |

### IA opcional (DeepSeek)

- **Gerar IA** por aula: lê o `.vtt`, chama LLM, gera resumo (`.md`), quiz interativo (`.html`), flashcards Anki (`.txt`), exemplos práticos (`.html`) e diário técnico (`.md`) em ~15-30s, custo ~$0.003-0.01 por aula
- **Geração em lote**: marque várias aulas do curso, deixa rodando
- **Validação pré-salvamento**: se o conteúdo gerado não passa no parser (ex.: < 3 cards, quiz sem `.question-card`), nada é gravado e o erro é reportado
- **Chat IA por aula**: FAB flutuante, conversa multi-turn com a transcrição como contexto. Histórico em Postgres (sincroniza entre dispositivos), sistema instrui o modelo a NÃO inventar (responde "isso não está na aula" se não houver base na transcrição)
- **Parser robusto** de flashcards com 4 fallbacks pra tolerar variações do LLM (tab, `<b>` inline, multi-espaço, "Pergunta: resposta")

### Dashboard de estudo

- **Heatmap de consistência** (90 dias) — reviews + pomodoros por dia, estilo GitHub
- **Curva de retenção** rolling 7d/30d por curso, com cores semânticas (verde ≥ 80%, âmbar 60-79%, vermelho < 60%)
- **Top cards problemáticos** ordenados por lapses
- **ETA pra zerar backlog** (cards vencidos ÷ ritmo médio 14d)
- **Perfil cognitivo**: streak (dias seguidos estudando), hora ótima/fraca do dia (acerto por hora), drift de dificuldade (D médio recente vs anterior), totais (cards, reviews, cards maduros)
- **Cards confusos**: grupos de enunciados semanticamente similares (Jaccard + union-find) que você está errando — mostra lado a lado pra você diferenciar conceitos próximos
- **Badge de acerto por módulo** + banner sugerindo revisão quando módulos caem abaixo de 60%

---

## Arquitetura em alto nível

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (localhost:5173)                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ React + Vite                                             │   │
│  │ • CoursePlatform (orquestração)                          │   │
│  │ • CoursesScreen / LessonsView / LessonPlayer             │   │
│  │ • LessonStepper (Video / Resumo / Quiz / FSRS / etc)     │   │
│  │ • Dashboard / DailyReview                                │   │
│  └────────────────────────────┬─────────────────────────────┘   │
└────────────────────────────────┼─────────────────────────────────┘
                                 │ fetch HTTP
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                    EXPRESS (localhost:3001)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ courses.js   │ │ flashcards.js│ │ stats.js     │            │
│  │ notes.js     │ │ quiz.js      │ │ ia.js        │            │
│  │ progress.js  │ │              │ │              │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
│         │                 │                │                   │
│  ┌──────▼─────────────────▼────────────────▼───────────────┐   │
│  │ server/flashcards.js (FSRS + ts-fsrs)                   │   │
│  │ server/ai/* (generator, chat, deepseek client)          │   │
│  │ server/semanticConfusion.js (Jaccard + union-find)      │   │
│  └─────┬───────────────────────────────────────────────────┘   │
└────────┼───────────────────────────────────────────────────────┘
         │
    ┌────▼────┐                ┌────────────┐         ┌──────────┐
    │ Postgres│◀───────────────│ Filesystem │ ───────▶│ DeepSeek │
    │ :5433   │                │ COURSES_   │ HTTPS   │ API      │
    │         │                │ PATH       │         │ (opt.)   │
    │ 12 tab. │                │ (vídeos +  │         │          │
    │         │                │  .vtt +    │         │          │
    └─────────┘                │  _ia.*)    │         └──────────┘
                               └────────────┘
```

### Fluxos principais

**Geração de IA**:

```
[botão Gerar IA]
   │
   ▼
[POST /api/ia/generate]
   │
   ▼
[generator.js] ── findTranscript() ──▶ [.vtt no disco]
   │              parseVtt()
   ▼
[deepseek.js] ── chatCompletion ──▶ [DeepSeek API]
   │
   ▼
[validação: parseAnkiFlashcards / contém .question-card]
   │
   ├─[OK]──▶ [escreve _ia.md/.html/.txt no disco]
   │           │
   │           ▼
   │        [importDeck() → Postgres flashcards table]
   │
   └─[FAIL]─▶ [retorna erro, nada é salvo]
```

**Review FSRS**:

```
[user clica rating 1-4]
   │
   ▼
[POST /api/flashcards/review/:cardId]
   │
   ▼
[reviewCard()] ── SELECT prev review ──▶ [cria Card / usa estado anterior]
   │
   ▼
[scheduler.next(card, now, rating)] (ts-fsrs)
   │
   ▼
[UPSERT flashcard_reviews, INSERT flashcard_review_log]
   │
   ▼
[retorna { state, due, stability, reps, lapses, ... }]
```

**Chat IA**:

```
[user digita pergunta no FAB]
   │
   ▼
[POST /api/ia/chat { message }]
   │
   ▼
[carrega histórico do DB (lesson_chats)]
   │
   ▼
[chatWithLesson] ── transcrição como system prompt
   │              ── histórico como contexto multi-turn
   ▼
[DeepSeek API]
   │
   ▼
[INSERT user + assistant em lesson_chats]
   │
   ▼
[retorna { reply }]
```

---

## Stack

### Runtime
- [Node.js](https://nodejs.org) ≥ 18 (recomendado 20.x LTS)
- [PostgreSQL](https://www.postgresql.org/) 16 (via Docker)
- [Docker](https://www.docker.com/) ≥ 20 + Docker Compose v2

### Frontend
- [React](https://react.dev/) 18.3
- [Vite](https://vitejs.dev/) 6
- [Tailwind CSS](https://tailwindcss.com/) 3.4 + [@tailwindcss/typography](https://tailwindcss.com/docs/typography-plugin)
- [react-markdown](https://github.com/remarkjs/react-markdown) 10 + [remark-gfm](https://github.com/remarkjs/remark-gfm)
- [lucide-react](https://lucide.dev/) (ícones)
- [react-collapsible](https://github.com/glennflanagan/react-collapsible)

### Backend
- [Express](https://expressjs.com/) 4.21
- [pg](https://node-postgres.com/) 8 (cliente Postgres)
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.3 (algoritmo FSRS oficial)
- [dotenv](https://github.com/motdotla/dotenv) 17

### IA
- DeepSeek API v3 (`deepseek-chat` por padrão; `deepseek-reasoner` opcional)
- Compatibilidade futura com Groq (suporte ao GROQ_API_KEY no `.env.example`)

### Dev tools
- [Vitest](https://vitest.dev/) 4 + [happy-dom](https://github.com/capricorn86/happy-dom) 20 (testes)
- [ESLint](https://eslint.org/) 9 (flat config) com plugins react/react-hooks/react-refresh
- [PostCSS](https://postcss.org/) 8 + [Autoprefixer](https://github.com/postcss/autoprefixer) 10

---

## Pré-requisitos

| Ferramenta | Versão mínima | Como verificar | Como instalar |
|---|---|---|---|
| **Node.js** | 18.x | `node -v` | https://nodejs.org / `nvm install 20` |
| **npm** | 9.x | `npm -v` | Vem com o Node |
| **Docker** | 20.x | `docker -v` | https://docs.docker.com/engine/install/ |
| **Docker Compose** | v2 (plugin) | `docker compose version` | Já vem com Docker Desktop ou `apt install docker-compose-plugin` |
| **Git** | 2.x | `git --version` | https://git-scm.com/downloads |

### Sistema operacional

- **Linux**: testado em CachyOS, Ubuntu 22.04+, Arch
- **macOS**: 12+ (Intel ou Apple Silicon)
- **Windows**: 10/11 com Docker Desktop (use o WSL2 backend)

### DeepSeek API key (opcional)

Para usar "Gerar IA" e o Chat IA:

1. Crie conta em https://platform.deepseek.com
2. Adicione crédito (mínimo $5; ~1000-2000 aulas com geração completa)
3. Gere chave em https://platform.deepseek.com/api_keys
4. Cole no `.env` (passo 3 do setup)

**Custo aproximado** (deepseek-chat, abr/2026):
- Resumo de aula 25min: ~$0.003
- Quiz com 10 questões: ~$0.005
- Flashcards (15 cards): ~$0.004
- Pacote completo (resumo + quiz + flashcards + diário + exemplos): ~$0.015-0.025
- Mensagem de chat: ~$0.001-0.003

---

## Setup completo

### Passo 1 — Clonar o repositório

```bash
git clone <url-do-repositório> playerCourseWeb
cd playerCourseWeb
```

### Passo 2 — Instalar dependências do Node

```bash
npm install
```

Instala ~560 pacotes (~80MB em `node_modules/`). Em conexões lentas pode demorar 1-3min.

### Passo 3 — Variáveis de ambiente

Copie o template:

```bash
cp .env.example .env
```

Edite `.env`:

```env
# Conexão com Postgres local (porta 5433 evita colidir com instalação nativa)
DATABASE_URL=postgres://playercourse:playercourse_dev@localhost:5433/playercourse

# Porta do backend Express (frontend Vite usa :5173 sempre)
PORT=3001

# Caminho ABSOLUTO da raiz dos cursos. Cada subpasta = um curso.
# Pode ser alterado em runtime pelo botão Config no UI; o .env é só o default.
COURSES_PATH=/caminho/absoluto/para/seus/cursos/

# Opcional — só pra "Gerar IA" e Chat IA
DEEPSEEK_API_KEY=

# Opcional — placeholder pra futura integração com Groq
GROQ_API_KEY=
```

> **Importante:**
> - `COURSES_PATH` precisa terminar com `/`
> - Sem `DEEPSEEK_API_KEY`, todo o resto do app continua funcionando — só "Gerar IA" e Chat IA ficam desabilitados

### Passo 4 — Subir o Postgres

```bash
docker compose up -d
```

O que acontece:
- Pulls `postgres:16-alpine` (~150MB na primeira vez)
- Cria container `playercourse-postgres` na porta `5433`
- Cria volume `playercourse_pgdata` pra persistir dados entre restarts
- Aplica `db/schema.sql` automaticamente via `docker-entrypoint-initdb.d`
- Healthcheck a cada 5s

Verificar:

```bash
docker compose ps
# Deve mostrar 'healthy' depois de ~10s

docker compose logs postgres
# Procure: 'database system is ready to accept connections'
```

### Passo 5 — Aplicar migrations (se schema mudou)

A primeira vez NÃO precisa — o entrypoint do Docker já aplicou. Mas após mudanças em `db/schema.sql` ou para garantir:

```bash
npm run db:migrate
```

O script é **idempotente** (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Pode rodar quantas vezes quiser sem corromper.

### Passo 6 — Rodar a aplicação

**Linux/macOS:**

```bash
./start.sh
```

**Windows:**

```cmd
start.bat
```

O script:
1. Verifica Node e NPM
2. Sobe `node server.js` em background (`:3001`)
3. Aguarda 3s
4. Sobe `npm run dev` (Vite, `:5173`)
5. Imprime PIDs e URLs
6. No `Ctrl+C`, faz `cleanup` e mata os dois processos

**Alternativa manual** (dois terminais — útil pra debug):

```bash
# Terminal 1
npm run server
```

```bash
# Terminal 2
npm run dev
```

### Passo 7 — Abrir no navegador

http://localhost:5173

Primeira execução:
1. Header da home: **Config** → ajusta `COURSES_PATH` se diferente do `.env`
2. Cursos aparecem no grid
3. Clique num curso → lista de aulas
4. Clique numa aula → player

Pronto. Plataforma rodando localmente, dados em Postgres, arquivos no seu disco.

---

## Estrutura esperada da pasta de cursos

O backend escaneia `COURSES_PATH` recursivamente. Convenções:

- **Cada subpasta direta** de `COURSES_PATH` = um **curso**
- **Subpastas dentro de um curso** = **módulos** (renderizados como collapsibles)
- **Arquivos** com extensões `.mp4 .webm .ts .m3u8 .mkv .pdf .html .md .txt` = aulas individuais

### Lesson groups (formato recomendado)

Aulas que têm material complementar são **agrupadas pelo prefixo**. Sufixos reconhecidos:

| Sufixo | Tipo de material | Extensão |
|---|---|---|
| `_dub` | vídeo | `.mp4`, `.webm`, `.ts`, `.m3u8`, `.mkv` |
| `_dub` | transcrição | `.vtt` (qualquer locale: `_dub.pt-br.vtt`, `_dub.vtt`) |
| `_resumo_dub_NN` | resumo | `.md` |
| `_exemplos_dub_NN` | exemplos práticos | `.html` |
| `_quiz_dub_NN` | quiz | `.html` |
| `_flashcards_anki_dub_NN` | flashcards | `.txt` (formato Anki tab-separated) |
| `_diario_tecnico_dub_NN` | diário técnico (template) | `.md` |

`NN` é um número sequencial (01, 02, ...). `_ia` é um sufixo opcional antes da extensão final que indica **arquivo gerado por IA** — quando existem versão manual e `_ia`, a IA tem prioridade no agrupamento.

### Exemplo concreto

```
/mnt/cursos/
├── Banco de Dados/
│   ├── 01 - Introdução/
│   │   ├── 01.-What-is-a-database_dub.mp4
│   │   ├── 01.-What-is-a-database_dub.vtt
│   │   ├── 01.-What-is-a-database_resumo_dub_01_ia.md
│   │   ├── 01.-What-is-a-database_quiz_dub_01_ia.html
│   │   ├── 01.-What-is-a-database_flashcards_anki_dub_01_ia.txt
│   │   └── 01.-What-is-a-database_diario_tecnico_dub_01.md
│   └── 02 - Modelagem/
│       ├── 36.-Introduction-716K_dub.mp4
│       ├── 36.-Introduction-716K_dub.vtt
│       └── ...
└── React Avançado/
    └── ...
```

O app agrupa cada conjunto num único item "01.-What-is-a-database" com stepper Video / Resumo / Quiz / Flashcards / Diário.

### Aulas avulsas (legacy)

Vídeos sem `.vtt` ou sem material complementar viram **aulas individuais** na lista, sem stepper. Funcionam pra assistir, mas:
- Sem `.vtt` → "Gerar IA" e Chat IA não funcionam
- Sem outros materiais → aparece como item simples, não como lesson group com tabs

---

## Como usar — fluxo do estudante

### Primeira semana

```
SEG │ Assiste aula 1 do curso ───▶ Gera IA ──▶ Lê resumo ──▶ Faz quiz
    │                                                          │
    │                                                          ▼
    │                                            Errou 3 questões
    │                                            (viraram cards FSRS)
    │                                                          │
    │                                                          ▼
    │                                          Revisa cards (rating 1-4)
    │
TER │ Tela "Revisar" mostra os 3 cards de ontem (FSRS agendou pra hoje)
    │ + assiste aula 2 ──▶ Gera IA ──▶ ...
    │
QUA │ Tela "Revisar" mostra cards de ontem (taxa baixa = mais frequência)
    │ + cards de antes (taxa boa = menos frequência)
    │ + assiste aula 3 ──▶ Gera IA ──▶ ...
    │
QUI │ Pomodoro toca, oferece pausa ativa: revisa 5 cards
    │
SEX │ Dashboard: heatmap mostra consistência. Retenção 7d em 78%.
    │ Banner sugere revisar módulo X (acerto < 60%).
    │
SAB │ Modal de diário semanal aparece automaticamente
    │ → reflexão: "o que aprendi", "que decisões tomei"
    │
DOM │ Cards confusos no dashboard: 3 grupos de conceitos parecidos
    │ que você está errando → revisa lado a lado, separa na memória
```

### Recomendações práticas

- **Não pule o "Meu Resumo"**. Escrever a síntese com suas palavras é onde a fixação realmente acontece. 3-5 frases já funcionam.
- **Nunca dê 4 (Easy) só pra agilizar**. O FSRS confia no rating — 4 atrasa muito a próxima revisão e você esquece.
- **Use o chat IA pra confusões pontuais**, não pra "estudar" passivamente. Pergunte o que você não entendeu, com sua dúvida formulada — isso é active recall.
- **Revise diariamente**, mesmo que sejam 5min. O FSRS prevê retenção exponencialmente decrescente sem revisão; um dia perdido vira 3 dias de catch-up.
- **Acerto baixo num módulo é sinal pra parar de avançar**. O banner sugere revisar antes — siga a sugestão.

### Geração em lote

Na lista de aulas, botão **"Gerar IA"** acima da lista abre o modal de lote:
1. Marca as aulas (checkboxes)
2. Marca os tipos de material (resumo / quiz / flashcards / exemplos / diário)
3. Escolhe modelo (deepseek-chat padrão, ou deepseek-reasoner pra raciocínio mais profundo)
4. **Gerar** — barra de progresso aula por aula

Útil ao começar um curso novo: gera material de 10-20 aulas de uma vez, deixa rodando, custa ~$0.20-0.50.

---

## Atalhos de teclado

Ativos quando uma aula está aberta (e o foco não está num input/textarea):

| Tecla | Ação |
|---|---|
| `Espaço` | Play / Pause |
| `←` / `→` | Retroceder / avançar 10s no vídeo |
| `↑` / `↓` | Aula anterior / próxima |
| `F` | Entrar/sair de fullscreen |
| `Esc` | Sair de fullscreen ou fechar chat IA |

No quiz, durante revisão de flashcards, ou no chat IA, os atalhos do player são desabilitados pra não conflitar com inputs/cliques.

---

## Endpoints da API

Servidor em `http://localhost:3001`. Todos retornam JSON exceto `/cursos/:file` (binário com Range support).

### Cursos e arquivos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/cursos/:file` | Streaming de mídia (Range support pra `<video>`) |
| GET | `/api/courses` | Lista cursos com módulos e aulas (estrutura recursiva) |
| GET | `/api/config/courses-path` | Lê COURSES_PATH atual |
| POST | `/api/config/courses-path` | Atualiza COURSES_PATH (em runtime) |
| GET | `/api/video-durations` | Mapa de durações cacheadas |
| POST | `/api/video-durations` | Sobrescreve cache inteiro |
| PUT | `/api/video-durations/:videoPath` | Atualiza uma duração |

### Progresso

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/progress/all` | Snapshot de todos os cursos (lessons + steps) |
| GET | `/api/progress/:course/lessons` | Aulas concluídas |
| POST | `/api/progress/:course/lessons` | Marca aula como concluída |
| DELETE | `/api/progress/:course/lessons` | Desmarca |
| GET | `/api/progress/:course/steps` | Etapas concluídas |
| POST/DELETE | `/api/progress/:course/steps` | Marca/desmarca etapa |

### Notas e diários

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/db/notes/:course/pessoal/:prefix` | Resumo pessoal por aula |
| GET/POST | `/api/db/notes/:course/pomodoro` | Sessões de pomodoro |
| GET/POST | `/api/db/diary/:course` | Diário semanal |
| GET/POST | `/api/db/diary-tecnico/:course/:prefix` | Diário técnico por aula |

### Flashcards e FSRS

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/flashcards/:course/:prefix/import` | (Re)importa deck do `.txt` |
| GET | `/api/flashcards/:course/:prefix` | Lista cards + estado FSRS |
| GET | `/api/flashcards/due?courseTitle=&limit=` | Cards vencidos (max 200) |
| GET | `/api/flashcards/summary` | Total/due por curso |
| GET | `/api/flashcards/confusion?courseTitle=&minLapses=` | Grupos semanticamente similares |
| POST | `/api/flashcards/review/:cardId` | Registra rating 1-4, atualiza FSRS |

### Quiz

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/quiz/:course/:prefix/attempts` | Histórico de tentativas |
| POST | `/api/quiz/:course/:prefix/wrong-to-flashcards` | Converte erradas em cards |

### Estatísticas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/stats/recent` | Acerto 7d (alimenta Pomodoro) |
| GET | `/api/stats/dashboard` | Heatmap + retenção + top lapsos + backlog |
| GET | `/api/stats/profile` | Perfil cognitivo (streak, hora, drift, totais) |
| GET | `/api/stats/lesson-accuracy/:course?days=` | Acerto por aula |

### IA

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/ia/generate` | Gera material da aula (DeepSeek) |
| POST | `/api/ia/chat` | Envia mensagem ao chat IA |
| GET | `/api/ia/chat/:course/:prefix` | Histórico do chat |
| DELETE | `/api/ia/chat/:course/:prefix` | Limpa histórico |

### Saúde

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/db/health` | `{ ok: true/false }` baseado em `SELECT 1` |

---

## Schema do banco

12 tabelas, organizadas em 4 fases (refletindo a evolução do projeto):

### Fase 1 — Progresso (substitui localStorage)

```sql
lesson_progress (course_title, lesson_path, completed_at)              -- aulas concluídas
step_completions (course_title, lesson_prefix, step_key, completed_at) -- etapas dentro da aula
personal_notes (course_title, lesson_prefix, content, updated_at)      -- resumo pessoal
pomodoro_sessions (id, course_title, lesson_prefix, content, kind,     -- reflexões/pausas
                   created_at)                                          --   kind: reflection/focus/break_active/break_passive
weekly_diaries (course_title, week_key, learned, decisions, different) -- diário semanal
```

### Fase 2 — Flashcards FSRS

```sql
flashcard_decks (id, course_title, lesson_prefix, source_file, imported_at)
  -- UNIQUE(course_title, lesson_prefix), 1 deck por aula

flashcards (id, deck_id, front, back, card_type, difficulty_hint, tags,
            source_timestamp, created_at)
  -- card_type: 'basic' (default) ou 'quiz_wrong' (gerado de quiz errado)

flashcard_reviews (card_id PK, state, due, stability, difficulty,
                   elapsed_days, scheduled_days, reps, lapses,
                   last_review, updated_at)
  -- 1:1 com flashcards, criado on-demand no primeiro review
  -- state: 0=New, 1=Learning, 2=Review, 3=Relearning

flashcard_review_log (id, card_id, rating, state_before, state_after,
                      elapsed_days, scheduled_days, stability,
                      difficulty, reviewed_at)
  -- audit trail completo, alimenta heatmap, retenção, perfil cognitivo
```

### Fase 2.5 — Diário técnico

```sql
technical_diary_notes (course_title, lesson_prefix, content, updated_at)
```

### Fase 3 — Quiz tracking

```sql
quiz_attempts (id, course_title, lesson_prefix, score, total, answered_at)
```

### Fase 4 — Chat IA

```sql
lesson_chats (id, course_title, lesson_prefix, role, content, created_at)
  -- role IN ('user', 'assistant')
```

### Diagrama de relacionamentos (FSRS)

```
flashcard_decks ──1:N──▶ flashcards ──1:1──▶ flashcard_reviews
                              │
                              └──1:N──▶ flashcard_review_log
```

Schema completo em `db/schema.sql`. Idempotente (`CREATE IF NOT EXISTS`).

---

## Estrutura do código

```
playerCourseWeb/
├── server.js                       # Bootstrap Express (41 linhas)
├── server/
│   ├── config.js                   # get/set de COURSES_PATH (mutável)
│   ├── flashcards.js               # FSRS: importDeck, reviewCard, getDueCards
│   ├── flashcardParser.js          # Parser .txt Anki com 4 fallbacks
│   ├── flashcardParser.test.js     # 15 testes do parser
│   ├── flashcards.test.js          # 14 testes de FSRS (db+fs mockados)
│   ├── semanticConfusion.js        # Tokenize PT-BR + Jaccard + union-find
│   ├── semanticConfusion.test.js   # 16 testes
│   ├── ai/
│   │   ├── deepseek.js             # Cliente HTTP, AbortController 120s
│   │   ├── prompts.js              # 5 prompts especializados
│   │   ├── generator.js            # Pipeline vtt → LLM → arquivo
│   │   └── chat.js                 # Multi-turn com transcrição como contexto
│   └── routes/                     # Express routers (separados em 7 arquivos)
│       ├── courses.js              # 7 endpoints (cursos + streaming + config)
│       ├── notes.js                # 4 endpoints (filesystem legacy)
│       ├── progress.js             # 14 endpoints (progress + DB notes + migrate)
│       ├── flashcards.js           # 6 endpoints (FSRS)
│       ├── quiz.js                 # 3 endpoints
│       ├── stats.js                # 4 endpoints
│       └── ia.js                   # 4 endpoints (gerar + chat)
├── db/
│   ├── schema.sql                  # 12 tabelas + índices
│   ├── migrate.js                  # Aplica schema (idempotente)
│   └── index.js                    # pg.Pool + ensureReady
├── src/
│   ├── components/                 # ~25 componentes
│   │   ├── CoursePlatform.jsx      # Orquestração: hooks + state + routing
│   │   ├── CoursesScreen.jsx       # Home (header + stats + grid)
│   │   ├── LessonsView.jsx         # Lista de aulas + banner
│   │   ├── LessonPlayer.jsx        # Decide modo: stepper / HTML / video legacy
│   │   ├── LessonStepper.jsx       # Tabs Video/Resumo/Quiz/etc.
│   │   ├── VideoPlayer.jsx         # <video> + controls + sidebar
│   │   ├── VideoControls.jsx       # Timeline + play/pause + velocidade
│   │   ├── MarkdownViewer.jsx      # ReactMarkdown com design de leitor
│   │   ├── QuizViewer.jsx          # Quiz parsing + tracking + envio de erradas
│   │   ├── ExamplesViewer.jsx      # Cards de exemplos
│   │   ├── FlashcardViewer.jsx     # Revisão FSRS por aula
│   │   ├── DailyReview.jsx         # Revisão global agregada
│   │   ├── Dashboard.jsx           # Heatmap + retenção + perfil + confusão
│   │   ├── PomodoroTimer.jsx       # Timer adaptativo + active recall
│   │   ├── LessonChat.jsx          # UI do chat (markdown render)
│   │   ├── ChatFAB.jsx             # FAB + painel deslizante
│   │   ├── AIGenerateModal.jsx     # Modal de geração por aula
│   │   ├── BulkAIGenerateModal.jsx # Modal de geração em lote
│   │   ├── PersonalSummary.jsx     # Editor markdown
│   │   ├── TechnicalDiary.jsx      # Editor markdown com template
│   │   ├── WeeklyDiaryModal.jsx    # Diário semanal automático
│   │   ├── HTMLViewer.jsx          # iframe pra HTML legado
│   │   ├── PDFViewer.jsx           # iframe + LessonHeader
│   │   ├── UnsupportedViewer.jsx   # Fallback pra tipos desconhecidos
│   │   ├── CourseSidebar.jsx       # Lista de aulas (sidebar)
│   │   ├── CourseCard.jsx          # Card de curso na home
│   │   ├── ModuleItem.jsx          # Item recursivo (módulo / aula / lesson-group)
│   │   ├── LessonHeader.jsx        # Header reutilizável (PDF/HTML)
│   │   ├── ConfigModal.jsx         # Modal de COURSES_PATH
│   │   └── CourseContext.jsx       # Context provider + useCourse()
│   ├── hooks/
│   │   ├── useCourseData.js        # Lista cursos + cache durations
│   │   ├── useCourseProgress.js    # Sync com Postgres
│   │   ├── useVideoPlayer.js       # State do player
│   │   ├── useFullscreen.js        # API de fullscreen
│   │   ├── useSidebar.js           # Posição/visibilidade
│   │   └── useLessonAccuracy.js    # Mapa lessonPrefix → accuracy
│   └── utils/
│       ├── courseUtils.js          # flatten/find/count + countWeakModules
│       ├── quizParser.js           # Parser HTML do quiz (DOMParser)
│       ├── quizParser.test.js      # 7 testes (happy-dom)
│       ├── examplesParser.js       # Parser HTML dos exemplos
│       ├── examplesParser.test.js  # 7 testes (happy-dom)
│       ├── progressApi.js          # ~30 helpers fetch
│       └── fileUtils.jsx           # isVideoFile, formatTime, getFileIcon
├── docker-compose.yml              # Postgres 16 + volume + healthcheck
├── eslint.config.js                # Flat config (zero erros)
├── tailwind.config.cjs
├── postcss.config.cjs
├── vite.config.js
├── package.json
├── start.sh                        # Bash universal (Linux/Mac/WSL)
├── start.bat                       # Windows cmd
├── .env.example
├── ROADMAP.md                      # Histórico do plano + decisões em aberto
└── README.md
```

---

## Algoritmos

### FSRS (Free Spaced Repetition Scheduler)

Versão usada: `ts-fsrs` 5.3 (oficial). Parâmetros:

```js
generatorParameters({ enable_fuzz: true, enable_short_term: true })
```

- `enable_fuzz`: adiciona ruído ±5% no intervalo agendado pra evitar pico em mesma data
- `enable_short_term`: usa Learning state pra cards novos antes de virar Review

Cada review atualiza:
- **stability** (S): quanto tempo o card "dura" antes da próxima revisão necessária
- **difficulty** (D): 1.0-10.0, quanto mais difícil, mais frequente a revisão
- **state**: 0=New → 1=Learning → 2=Review → (3=Relearning se errar em Review)
- **due**: timestamp da próxima revisão
- **reps** / **lapses**: contadores

A função `scheduler.next(card, now, rating)` retorna o card atualizado + log entry. Persistimos em `flashcard_reviews` (estado atual) e `flashcard_review_log` (audit trail).

### Parser de flashcards (4 fallbacks)

Cada linha de um `.txt` Anki é tentada em ordem:

1. **Tab-separated**: `pergunta\tresposta` (formato canônico)
2. **`<b>` inline**: `pergunta <b>resposta</b> texto extra`
3. **Multi-espaço**: `pergunta    resposta` (4+ espaços; LLMs frequentemente trocam tab por espaço)
4. **Colon**: `Pergunta: resposta` (frase com 5+ chars antes do `:` e 2+ depois)

Se nenhum casa, a linha é descartada. Comentários (`#separator:tab`, `#html:true`) são ignorados.

Cobertura: 15 testes em `server/flashcardParser.test.js`.

### Detecção de confusão semântica

Identifica grupos de cards com enunciados parecidos que o aluno está errando muito:

1. Filtra cards com `lapses >= minLapses` (default 2)
2. **Tokeniza** cada `front`: lowercase, remove acentos (NFD), remove stopwords PT-BR (~50 palavras), filtra tokens com ≤ 2 chars
3. **Jaccard similarity** par a par: `|A ∩ B| / |A ∪ B|`
4. **Union-find** com path compression: para cada par com similaridade ≥ threshold (default 0.4), une no mesmo grupo
5. Retorna grupos com ≥ 2 cards, ordenados por `totalLapses` desc

Complexidade: O(n²) na similaridade (OK até alguns milhares de cards). Acima disso, trocar por MinHash/LSH.

Cobertura: 16 testes em `server/semanticConfusion.test.js`.

### Pomodoro adaptativo

Duração de foco baseada em acerto 7d:

```js
const adaptiveFocusSeconds = (accuracy7d) => {
  if (accuracy7d == null) return 25 * 60;
  if (accuracy7d < 0.6)   return 20 * 60;  // ruim → menos foco, evita cansar
  if (accuracy7d > 0.85)  return 45 * 60;  // confortável → deep work
  return 25 * 60;
};
```

Lê de `GET /api/stats/recent` ao iniciar. Não recalcula durante a sessão.

---

## Desenvolvimento

```bash
# Frontend
npm run dev          # Vite em :5173, HMR
npm run build        # build production em dist/
npm run preview      # serve dist/ pra testar build

# Backend
npm run server       # Express em :3001 (sem hot-reload)

# Banco
npm run db:migrate   # aplica schema.sql (idempotente)

# Testes e qualidade
npm test             # vitest run (59 testes)
npm run test:watch   # vitest interativo
npm run lint         # eslint (0 erros, 13 warnings de estilo)
```

### Convenções

- **JS vanilla** (sem TypeScript). Imports de tipo via JSDoc quando necessário
- **JSX transform automático** (sem `import React` em todo arquivo)
- **CSS via Tailwind** (sem CSS modules, sem styled-components). Classes utility ordenadas: layout → spacing → cores → estados
- **Componentes funcionais** + hooks. Sem class components
- **Sem PropTypes** (lint desabilitado). Tipos vivem na assinatura de props
- **camelCase** em JS, **kebab-case** em arquivos `.html`/`.md`/CSS
- **Comentários em português** quando não óbvio. WHY > WHAT
- **Imports relativos** (`./CourseContext`), sem aliases configurados

### Adicionando uma rota nova no backend

1. Cria/edita `server/routes/<grupo>.js` com `import express` + `const router = express.Router()`
2. Adiciona handler com `router.get/post/...`
3. Exporta `default router`
4. Em `server.js`, importa e adiciona `app.use(seuRouter)`

Exemplo mínimo:

```js
// server/routes/foo.js
import express from 'express';
import { query } from '../../db/index.js';

const router = express.Router();

router.get('/api/foo', async (_req, res) => {
  try {
    const { rows } = await query('SELECT NOW() AS now');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

### Adicionando um componente novo no frontend

1. Cria `src/components/MeuComponente.jsx`
2. Importa onde for usar
3. Se precisa de dados de curso, usa `import { useCourse } from "./CourseContext"`
4. Se precisa de fetch, usa helpers de `src/utils/progressApi.js` ou cria um novo lá

---

## Testes

```bash
npm test
```

Saída:

```
Test Files  5 passed (5)
     Tests  59 passed (59)
  Duration  ~400ms
```

### Cobertura por módulo

| Arquivo | Testes | O que cobre |
|---|---|---|
| `server/flashcardParser.test.js` | 15 | 4 formatos de parsing + edge cases |
| `server/semanticConfusion.test.js` | 16 | Tokenize, Jaccard, union-find, ordenação |
| `server/flashcards.test.js` | 14 | FSRS reviewCard, getDueCards, importDeck (db+fs mockados) |
| `src/utils/quizParser.test.js` | 7 | Parser HTML do quiz (happy-dom) |
| `src/utils/examplesParser.test.js` | 7 | Parser HTML dos exemplos (happy-dom) |

### Estratégia de mock

- **Backend (FSRS, parsers)**: `vi.mock('../db/index.js')` + `vi.mock('fs')`. `query` e `fs.readdir/readFile` viram funções mock; setamos `mockResolvedValueOnce` no setup
- **Frontend (parsers HTML)**: marcador `// @vitest-environment happy-dom` no topo do arquivo, faz o teste rodar em DOM simulado

### O que NÃO está coberto (ainda)

- Componentes React (renderização)
- Endpoints HTTP em si (testes de integração)
- DeepSeek client (mockaria a API real)

Para cobrir, sugestão: `@testing-library/react` para componentes; `supertest` para integração de rotas.

---

## Performance

### Tamanho do bundle (production)

```
dist/assets/index-XXXX.js    480kB  (gzip 140kB)
dist/assets/index-XXXX.css    58kB  (gzip   8kB)
dist/index.html             0.5kB
```

Top contribuintes do JS:
1. `react-markdown` + `remark-gfm` (~120kB)
2. `react-collapsible` + `react-dom` (~80kB)
3. `lucide-react` (~70kB — todos os ícones; tree-shaking parcial)
4. App code (~120kB)

Caminhos para reduzir (não aplicados):
- `lucide-react` por imports individuais reduz ~50kB
- Lazy load de `Dashboard` e `DailyReview` (rotas usadas raramente)
- Code-splitting do `MarkdownViewer` (~80kB de markdown deps)

### Banco

- Índices em `(course_title, lesson_prefix)` em todas as tabelas relevantes
- `flashcard_review_log` ordenado por `(card_id, reviewed_at DESC)` para audit queries rápidas
- `flashcard_reviews.due` indexado para `getDueCards`
- Pool `pg` default (10 conexões; tunável via `?pool=N` na DATABASE_URL se precisar)

Em datasets reais (50+ cursos, 500+ aulas, 10k+ cards):
- `/api/courses`: 50-200ms (depende da árvore de pastas)
- `/api/flashcards/due`: < 50ms
- `/api/stats/dashboard`: 100-300ms (4 queries agregadas)
- `/api/stats/profile`: 100-200ms

### Streaming de vídeo

`/cursos/:file` usa `createReadStream` com Range support — vídeos 4GB+ tocam sem carregar tudo na RAM. Cada request lê só o range pedido pelo `<video>`.

---

## Privacidade e segurança

### O que fica local

- **Tudo** dos dados pessoais: progresso, flashcards, reviews, anotações, diários, chats
- **Vídeos e arquivos de curso**: nunca saem da sua máquina
- **Postgres**: container Docker local, porta 5433, sem expor pra rede

### O que sai da máquina (só se você usar IA)

- Quando você clica em **Gerar IA**: a transcrição `.vtt` da aula é enviada para a DeepSeek API
- Quando você usa o **Chat IA**: cada mensagem + a transcrição vai pra DeepSeek
- A DeepSeek tem [política de privacidade](https://platform.deepseek.com/legal/privacy-policy) — leia antes de usar com material sensível

### Sem login, sem multi-user

- Não há autenticação. Qualquer um com acesso a `localhost:3001` lê e escreve no seu banco
- Não exponha o backend pra rede pública sem antes adicionar auth
- O `COURSES_PATH` é trocável via API — em ambientes hostis, restrinja na config

### Sem telemetria

O app **não envia nada** pra ninguém (exceto a chamada explícita à DeepSeek quando você pede). Sem analytics, sem error reporting, sem crash dumps.

---

## Troubleshooting

### "ERR_CONNECTION_REFUSED" ou "Postgres indisponível"

```bash
docker compose ps                # confirma que tá up
docker compose logs postgres     # vê o erro
docker compose restart postgres
```

Se o volume corrompeu (raro): `docker compose down -v` apaga e recria. **Destrói os dados.**

### "Diretório de cursos não encontrado"

`COURSES_PATH` não existe ou sem permissão de leitura. Confira:

```bash
ls -la /caminho/configurado
```

Ajuste no `.env` ou via UI (Config).

### Porta 3001 ou 5173 em uso

```bash
# Linux/Mac
lsof -i :3001
lsof -i :5173
kill -9 <pid>

# Windows
netstat -ano | findstr :3001
taskkill /PID <pid> /F
```

Pra trocar:
- Backend: `PORT=3002` no `.env`
- Frontend: `server.port: 5174` em `vite.config.js`

### "DEEPSEEK_API_KEY não configurada"

Mensagem só aparece quando tenta usar **Gerar IA** ou **Chat**. Resto do app funciona. Se quiser usar a IA: cria conta, gera key, cola no `.env`, reinicia o backend.

### "transcrição .vtt não encontrada"

A IA precisa do `.vtt` pra gerar material e responder no chat. Soluções:

- **Whisper** (OpenAI, local):
  ```bash
  whisper aula.mp4 --output_format vtt --language pt
  ```
- **yt-dlp** (download de YouTube/etc com legendas):
  ```bash
  yt-dlp --write-auto-subs --sub-lang pt --convert-subs vtt URL
  ```
- O nome precisa terminar com `_dub.vtt` (ex: `aula01_dub.vtt`) pra ser reconhecido

### Flashcards com 0 cards depois de gerar

A IA pode ter saído de formato. O parser tolera 4 fallbacks, mas se sair vazio o backend retorna `Flashcards: apenas X cards parseados (mínimo 3)` e nada é salvo. Re-gere. Se acontecer várias vezes seguidas:

1. Abre o `_flashcards_anki_dub_NN_ia.txt` gerado (mesmo que vazio do ponto de vista do parser, foi salvo? — não, só salva se passar)
2. Abre o `.vtt` da aula: tem texto suficiente? Tem ao menos 50 chars de transcrição?
3. Tenta com `deepseek-reasoner` (modal de gerar IA tem o seletor)

### Build do frontend lento (> 5s)

Vite 6 deveria buildar em 2-3s. Se está lento:

```bash
rm -rf node_modules dist
npm install
npm run build
```

Cache corrompido é a causa mais comum.

### Reset completo (perde TUDO)

```bash
docker compose down -v   # apaga volume Postgres
rm video-durations-cache.json
docker compose up -d
npm run db:migrate       # garante schema mais recente
```

---

## FAQ

**Posso rodar sem Docker?**

Sim, com Postgres instalado nativamente. Edita `DATABASE_URL` pra apontar pra ele e roda `npm run db:migrate`. O `docker-compose.yml` é só conveniência.

**Posso usar SQLite em vez de Postgres?**

Não diretamente — várias queries usam features Postgres específicas (`generate_series`, `INTERVAL`, `FILTER (WHERE ...)`, `::int`). Migração possível mas não trivial.

**Posso compartilhar o app com amigos?**

Não há auth. Pra compartilhar, precisa adicionar `users` + JWT + escopar todas as queries por `user_id`. Há nota no ROADMAP. Por enquanto é single-user local.

**Posso usar outro LLM (OpenAI, Claude, Llama local)?**

A interface da DeepSeek é OpenAI-compatible (mesmo formato `chat/completions`). Substituir é trocar a `DEEPSEEK_URL` em `server/ai/deepseek.js` e o `Authorization` header. Para Ollama local, basta apontar pra `http://localhost:11434/v1/chat/completions`.

**O FSRS funciona offline?**

Sim. Toda a lógica é local (`ts-fsrs` no backend). Você só precisa de internet pra "Gerar IA" e Chat — o resto roda totalmente offline.

**Posso importar meu deck Anki existente?**

Hoje só importa do formato `.txt` produzido pelo gerador. Pra trazer deck `.apkg` do Anki, precisa converter — script externo no roadmap.

**Tem app mobile?**

Não. É um app web local — você abre no navegador da máquina onde rodou. Acessível de outro dispositivo na rede local trocando `localhost` por o IP da máquina, mas sem auth, considere implicações.

**Por que DeepSeek e não GPT/Claude?**

Custo: DeepSeek-V3 é ~10× mais barato que GPT-4o e ~5× mais barato que Claude Sonnet, com qualidade comparável pra geração estruturada (resumo, quiz). O `.env.example` reserva `GROQ_API_KEY` pra adicionar Groq (Llama hospedado, ainda mais barato) no futuro.

**Como funciona o "ETA backlog"?**

`dueCards / avgPerDay` onde `avgPerDay = reviews_dos_últimos_14_dias / 14`. Estimativa linear, ignora que cards revisados hoje viram dueCards de novo no futuro. Bom como sanity check, não como deadline absoluta.

---

## Glossário

| Termo | Definição |
|---|---|
| **FSRS** | Free Spaced Repetition Scheduler — algoritmo de repetição espaçada usado pelo Anki desde 2024, supera SM-2 (~70% redução em tempo de estudo pra mesma retenção) |
| **Lesson group** | Conjunto de arquivos com mesmo prefixo agrupados em uma unidade de estudo com stepper |
| **Lapse** | Quando você dá rating 1 (Again) num card que estava em estado Review. O card volta pra Relearning. Lapses indicam confusão real |
| **Stability (S)** | Quantos dias o card "dura" antes da próxima revisão necessária. Cresce a cada acerto |
| **Difficulty (D)** | 1.0-10.0; quanto mais alto, mais frequente a revisão. Sobe quando você erra |
| **Drift de D** | Diferença entre D médio recente (7d) e anterior (7-30d). Positivo = cards estão ficando mais difíceis (queda de retenção), negativo = mais fáceis |
| **Active recall** | Tentar lembrar antes de ver a resposta. ~2× mais eficiente que releitura |
| **Mature card** | Card com `state >= 2` (Review ou Relearning). Conceito que já saiu da fase de aprendizado inicial |
| **Streak** | Dias consecutivos com pelo menos uma revisão. Métrica de consistência |
| **Lesson prefix** | Nome do arquivo sem o sufixo de tipo. Ex: `36.-Introduction-716K` é o prefix de `36.-Introduction-716K_dub.mp4` e do quiz/resumo/etc associados |

---

## Contribuindo

Contribuições são bem-vindas. Antes de abrir um PR:

1. **Discutir mudança grande em issue** primeiro — evita retrabalho
2. **Rodar testes localmente**: `npm test && npm run lint && npm run build`
3. **Manter zero erros de lint**. Warnings de `react-refresh/only-export-components` e `react-hooks/exhaustive-deps` são tolerados quando não tem solução clean
4. **Adicionar testes** pra novas funções puras (parsers, scheduler logic, similaridade)
5. **Commits convencionais**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`. Mensagem em português ok
6. **Atualizar ROADMAP.md** se mudou estado de algum item

### Áreas em aberto

- Importação de decks `.apkg` do Anki
- Suporte a mais provedores de LLM (Ollama local, Groq, OpenAI)
- Auth multi-user (`users` + JWT, escopo por user_id em todas as queries)
- Teste de integração de rotas com `supertest`
- Reorder de módulos por acerto (hoje só badge — falta drag-to-reorder)
- App mobile (PWA seria suficiente)

Veja `ROADMAP.md` para o backlog completo.

---

## Licença

Uso pessoal. Adicione uma licença explícita (MIT, Apache 2.0, GPL-3.0) antes de distribuir.

---

## Créditos

- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) — algoritmo FSRS de referência
- [DeepSeek](https://www.deepseek.com/) — LLM custo-efetivo pra geração de material
- [lucide-react](https://lucide.dev/) — ícones
- Curva de Ebbinghaus, Active Recall (Roediger & Karpicke 2006), Spacing Effect (Cepeda et al. 2008) — base de pesquisa
