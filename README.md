# 🎓 Player Course Web

Plataforma local de estudo com foco em **fixação**: assiste aulas, gera material de apoio com IA (resumo, quiz, flashcards), revisa com repetição espaçada (FSRS) e acompanha progresso em um dashboard com heatmap, retenção e perfil cognitivo.

## ✨ O que tem

### Base
- Player de vídeo com controles customizados, seek e fullscreen
- Navegação por teclado (setas, espaço, F)
- Agrupamento automático de aulas em "lesson groups" (vídeo + resumo + exemplos + quiz + flashcards + diário) via stepper
- Suporte a HTML, PDF, Markdown e vídeo

### Fixação (neurociência aplicada)
- **FSRS** (Free Spaced Repetition Scheduler) pra flashcards — ratings 1-4, `ts-fsrs` no servidor, estado persistido
- Tela **"Revisar"** global agregando cards vencidos de todos os cursos
- **Quiz com tracking**: passo só conta como concluído com acerto ≥ 70%. Questões erradas viram flashcards extras no deck da aula
- **Pomodoro adaptativo**: duração do foco ajusta com base no acerto de 7d; ao fim do ciclo, oferece "Revisar 5 cards" (pausa ativa) ou pausa passiva
- **Diário técnico** e resumo pessoal por aula (editor markdown inline)
- **Diário semanal** do curso

### IA (opcional, via DeepSeek)
- Gera resumo, quiz, flashcards, diário e exemplos a partir da transcrição `.vtt` da aula
- Botão "Gerar IA" por aula (único) ou em lote pelo curso todo
- Flashcards gerados entram direto no deck FSRS com dedup

### Dashboard de estudo
- Heatmap de consistência (90 dias) — reviews + pomodoros por dia
- Retenção rolling 7d/30d por curso
- Top cards com mais lapsos
- ETA para zerar backlog (due ÷ ritmo 14d)
- Perfil cognitivo: streak, hora ótima/fraca do dia, drift de dificuldade
- **Cards confusos**: grupos de enunciados semanticamente similares (Jaccard + union-find) pra revisar lado a lado

## 🏗️ Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + react-markdown + lucide-react
- **Backend**: Node.js + Express (rotas separadas em `server/routes/*.js`)
- **DB**: PostgreSQL 16 via docker-compose
- **FSRS**: `ts-fsrs`
- **IA**: DeepSeek API (v3 chat)
- **Testes**: Vitest + happy-dom (59 testes)

## 🚀 Setup

### Pré-requisitos
- Node.js 18+
- Docker + Docker Compose (pro Postgres)
- Opcional: chave da DeepSeek API pra gerar material

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar `.env`
Copie `.env.example` para `.env` e ajuste:
```bash
DATABASE_URL=postgres://playercourse:playercourse_dev@localhost:5433/playercourse
PORT=3001
COURSES_PATH=/caminho/para/sua/pasta/de/cursos/
DEEPSEEK_API_KEY=      # opcional, só se quiser usar "Gerar IA"
```

### 3. Subir o Postgres
```bash
docker compose up -d
```
O schema em `db/schema.sql` é aplicado automaticamente na primeira subida. Pra re-rodar migrations manualmente:
```bash
npm run db:migrate
```

### 4. Rodar backend + frontend

**Linux/Mac:**
```bash
./start.sh
```

**Windows:**
```cmd
start.bat
```

O script verifica Node/NPM, sobe os dois serviços e limpa ambos no Ctrl+C.

Alternativa manual:
```bash
npm run server   # backend em :3001
npm run dev      # frontend em :5173
```

### Acesso
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## 📁 Configuração de cursos

1. Na tela inicial, clique em **Config** (canto superior direito)
2. Defina o caminho raiz das pastas de curso
3. Cada subpasta vira um curso; arquivos dentro são agrupados por prefixo (ex: `36.-Intro_dub.mp4` + `36.-Intro_resumo_dub_01.md` + `36.-Intro_quiz_dub_01.html` → um lesson group único)

## 🎮 Atalhos de teclado

| Tecla | Ação |
|---|---|
| Espaço | Play/Pause |
| ←/→ | Retroceder/avançar 10s |
| ↑/↓ | Vídeo anterior/próximo |
| F | Fullscreen |
| Esc | Sair do fullscreen |

## 🧪 Desenvolvimento

```bash
npm test          # 59 testes (Vitest)
npm run test:watch
npm run lint      # zero erros, 13 warnings de estilo
npm run build     # produção em dist/
```

## 📂 Estrutura

```
server.js              # bootstrap: middleware + app.use routers
server/
  config.js            # get/set de COURSES_PATH (mutável em runtime)
  flashcards.js        # FSRS + importDeck + getDueCards + reviewCard
  flashcardParser.js   # parser robusto do formato Anki (4 fallbacks)
  semanticConfusion.js # tokenize + Jaccard + union-find
  ai/                  # prompts + cliente DeepSeek + generator
  routes/              # courses, notes, progress, flashcards, quiz, stats, ia
db/
  schema.sql           # tabelas de progresso + decks FSRS + reviews + logs
  migrate.js
src/
  components/          # CoursesScreen, LessonsView, LessonPlayer, viewers,
                       # FlashcardViewer, QuizViewer, ExamplesViewer, Dashboard, etc.
  hooks/               # useCourseData, useCourseProgress, useVideoPlayer,
                       # useFullscreen, useSidebar, useLessonAccuracy
  utils/               # courseUtils, quizParser, examplesParser, progressApi
```

## 📖 Roadmap

Veja `ROADMAP.md` para o estado atual do plano e decisões em aberto (Next.js?, auth multi-user?).
