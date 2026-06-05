# Player Course Web

> Plataforma de estudo que transforma cursos em vídeo numa rotina de fixação ativa:
> **assistir → gerar material com IA → revisar com repetição espaçada (FSRS) → consolidar com active recall.**

![stack](https://img.shields.io/badge/stack-React%20%2B%20Express%20%2B%20Postgres-blue) ![node](https://img.shields.io/badge/node-%3E%3D18-339933)

## Por que existe

Apoia-se em três achados da ciência da aprendizagem:

1. Assistir aula é consumo **passivo** — sem reativação, ~70% some em 24h (Ebbinghaus).
2. **Active recall** (testar-se) retém 2–3× mais que reler.
3. **Repetição espaçada** adaptativa (FSRS) corta tempo de estudo mantendo a retenção.

Sobre os cursos que você já tem: cada aula vira uma unidade de estudo (resumo, quiz, flashcards, diário) e o progresso de retenção alimenta um dashboard que diz **o que revisar e quando**.

## Funcionalidades

- **Player + lesson groups** — vídeo (MP4/WEBM/MKV/M3U8/TS), PDF, HTML, Markdown. Arquivos de mesmo prefixo viram uma linha do tempo de etapas: Pré-quiz · Vídeo · Resumo · Exemplos · Pausa · Quiz · Flashcards · Meu Resumo. Sidebar deslizante, layout de 1 a 5 colunas, atalhos de teclado.
- **Fixação** — FSRS por card, tela *Revisar* (cards vencidos de todos os cursos), quiz com tracking (erros viram cards), pré-quiz (Carpenter & Toftness), pomodoro adaptativo, resumo pessoal e diário semanal. O **diário técnico** (gerado por IA) fica como revisão no nível do módulo, fora da pipeline da aula.
- **IA opcional (DeepSeek)** — gera resumo, quiz, flashcards, exemplos, diário e pré-quiz por aula ou em lote (lê a transcrição `.vtt`). Chat por aula com a transcrição como contexto. Validação antes de salvar.
- **Dashboard** — heatmap de consistência, curva de retenção 7d/30d, cards problemáticos/confusos, perfil cognitivo (streak, hora ótima, drift de dificuldade), badges por módulo.
- **Curso de digitação** — módulo fixo de touch typing PT-BR (ABNT2): currículo progressivo e cumulativo, teclado virtual com dedo certo, som opcional, conclusão por precisão ≥95%, progresso por lição no banco.
- **Temas** — 4 paletas escuras (petrol, forest, slate, ciano).
- **Conta** — login/cadastro/reset via Supabase Auth; dados isolados por usuário (RLS).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 · Vite · Tailwind |
| Backend | Node · Express |
| Banco | Postgres (Supabase em produção, Docker local em dev) |
| Auth | Supabase Auth |
| Fonte dos cursos | Filesystem local **ou** Google Drive |
| IA | DeepSeek (opcional) |

## Setup

Pré-requisitos: **Node ≥ 18** e npm. Para banco **local**, também **Docker + Compose v2**. Para banco **Supabase**, basta as chaves no `.env`.

### Rápido

```bash
git clone <url> playerCourseWeb && cd playerCourseWeb
./setup.sh            # Linux/macOS/WSL   (Windows: .\setup.ps1)
./start.sh            # ou, em 2 terminais: npm run server  /  npm run dev
```

Abra `http://localhost:5173`.

### Manual

```bash
npm install
cp .env.example .env          # edite (ver abaixo)
docker compose up -d          # só se usar Postgres local
npm run db:migrate:versioned  # aplica db/migrations/*.sql
npm run server                # backend  :3001
npm run dev                   # frontend :5173
```

### `.env` essencial

```env
# Banco ativo (use a URL local OU a do Supabase)
DATABASE_URL=postgres://playercourse:playercourse_dev@localhost:5433/playercourse

PORT=3001
COURSES_PATH=/caminho/absoluto/para/seus/cursos/   # termine com /
CLIENT_ORIGIN=http://localhost:5173

# Supabase (auth + banco de produção)
SUPABASE_URL=...           SUPABASE_SERVICE_KEY=...   SUPABASE_ANON_KEY=...
VITE_SUPABASE_URL=...       VITE_SUPABASE_ANON_KEY=...

# Opcional — habilita "Gerar IA" e Chat IA
DEEPSEEK_API_KEY=
```

Sem `DEEPSEEK_API_KEY` o app funciona normalmente — só os recursos de IA ficam desativados.

## Estrutura da pasta de cursos

O backend escaneia `COURSES_PATH` (ou a pasta do Google Drive) recursivamente:

- subpasta direta = **curso**; subpastas internas = **módulos**;
- arquivos de mesmo **prefixo** com sufixos conhecidos formam um **lesson group**.

| Sufixo | Material | Extensão |
|---|---|---|
| `_dub` | vídeo / transcrição | `.mp4`…/`.vtt`,`.txt` |
| `_resumo_dub_NN` | resumo | `.md` |
| `_exemplos_dub_NN` | exemplos | `.html`/`.md` |
| `_quiz_dub_NN` | quiz | `.html`/`.md` |
| `_flashcards_anki_dub_NN` | flashcards | `.txt` (Anki) |
| `_diario_tecnico_dub_NN` | diário (template) | `.md` |

`_ia` antes da extensão marca material gerado por IA (tem prioridade). Materiais gerados também podem viver só no banco (`lesson_materials`), sem arquivo.

```
/cursos/
└── Banco de Dados/
    └── 01 - Introdução/
        ├── 01-intro_dub.mp4
        ├── 01-intro_dub.vtt
        ├── 01-intro_resumo_dub_01_ia.md
        └── 01-intro_quiz_dub_01_ia.html
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Frontend Vite (`:5173`) |
| `npm run server` | Backend Express (`:3001`) |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run db:migrate:versioned` | Aplica migrations versionadas (`db/migrations/`) |
| `npm run db:migrate` | Aplica/garante o schema base (`db/schema.sql`) |

## Arquitetura

```
React (Vite)  ──/api/*──►  Express  ──►  Postgres (Supabase/local)
   │                          │
   │                          ├─ disco local  (COURSES_PATH)  ── streaming de mídia
   └─ Supabase Auth (JWT)     └─ Google Drive (modo Drive)    ── DeepSeek (IA opcional)
```

- **Rotas** (`server/routes/`): `courses`, `materials`, `progress`, `notes`, `flashcards`, `quiz`, `stats`, `ia`, `typing`, `drive`. Tudo sob `requireAuth` (valida o JWT do Supabase), exceto o callback do Drive.
- **Frontend** (`src/`): `components/`, `hooks/`, `contexts/` (auth, tema, curso), `utils/`, `typing/` (currículo e teclado).
- **Banco** (`db/`): `schema.sql` + `migrations/*.sql`. Tabelas principais: `lesson_progress`, `step_completions`, `lesson_materials`, `flashcard_decks`/`flashcards`/`flashcard_reviews` (FSRS), `quiz_attempts`, `lesson_chats`, `typing_progress`. Colunas `user_id` + RLS isolam por usuário.

## Troubleshooting

- **Postgres indisponível** — confira `DATABASE_URL`; em local, `docker compose ps` deve mostrar `healthy`.
- **Diretório de cursos não encontrado** — `COURSES_PATH` precisa ser absoluto e terminar com `/` (ajustável em runtime no botão *Config*).
- **Porta 3001/5173 em uso** — encerre o processo anterior ou mude `PORT`.
- **"DEEPSEEK_API_KEY não configurada"** — esperado sem a chave; só a IA fica off.
- **"transcrição não encontrada"** — a aula precisa de um `.vtt`/`.txt` irmão do vídeo para gerar material/chat.
- **Progresso não salva** — rode `npm run db:migrate:versioned` e reinicie o `server.js`.

## Licença

Uso pessoal. Adicione uma licença explícita (MIT, Apache 2.0, GPL-3.0) antes de distribuir.

## Créditos

[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) · [DeepSeek](https://www.deepseek.com/) · [lucide-react](https://lucide.dev/) · pesquisa: Ebbinghaus, Roediger & Karpicke (2006), Cepeda et al. (2008).
