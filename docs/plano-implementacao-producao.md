# Plano de implementação em produção — Leitura (F1–F4 + OCR ground-truth)

> **HANDOFF.** Doc auto-suficiente. Consolida a investigação inteira (fases de leitura + decisão de
> modelo WhisperX + correção ancorada + pipeline OCR validado). Docs irmãos: `roadmap.md` (raiz, com
> checkboxes + TD-1..17), `docs/plano-producao-leitura.md` (spike original), `docs/pesquisa-whisperx-erros.md`.
> **Nada está commitado ainda** — tudo vive na árvore de trabalho, atrás de flags.

---

## 0. TL;DR — o que vai pra produção, em 2 blocos

**BLOCO A — já implementado e validado (só falta commitar):** F1 normalização, F2 correção, F3 clareza
(modo), F4 contrato + correção ancorada, modelo WhisperX → `large-v2`, `initial_prompt` removido.

**BLOCO B — a construir (o pipeline OCR, validado como spike):** keyframes → PaddleOCR (código) /
Qwen3-VL (diagramas) → vocabulário canônico + diagramas fiéis → corrige a transcrição na fonte
(ground-truth) e alimenta o contrato. **Supera** a heurística frágil da F1 para termos de código.

**Decisões travadas nesta investigação:**
- **Texto (pré-condensação/fingerprint) = Qwen3.5-9B** (A/B com o VL empatou; mantém o especialista de texto).
- **Diagrama = Qwen3-VL-8B local** (extrai estrutura → Mermaid; validado no DFD Yourdon).
- **Código/texto na tela = PaddleOCR (PP-OCRv6, mkldnn off)** (fiel; o VL normaliza token estranho — validado).
- **PT = `large-v2`** (v3/turbo alucinam mais; validado). **`initial_prompt` removido** (alucina).
- **Correção de termo não é dicionário nem heurística** — é **ground-truth da tela** (OCR).

---

## 1. BLOCO A — o que já está pronto (commit)

Tudo na árvore de trabalho, atrás de flag, validado (ver `roadmap.md`). Arquivos de produção mexidos:
`precondense.js`, `precondenseStore.js`, `prompts.js`, `readingCourse.js`, `whisperx.js`,
`routes/ia.js`, `ReadingBatchScreen.jsx`, `progressApi.js`, `readingGeneration.js`.

| Fase | Flag / toggle | Estado |
|---|---|---|
| F1 normalização (Qwen propõe → vet → aplica; + ancoragem no contrato) | `PRECOND_NORMALIZE_ENABLED=1` + toggle "Normalizar (F1)" | validado |
| F2 correção técnica | `READING_CORRECTNESS=1` | validado (JWT compila) |
| F3 clareza como modo | `READING_CLARITY_ENABLED=1` + toggle "Clareza (F3)" | validado |
| F4 contrato + planejador enriquecido + correção ancorada | `READING_CONTRACT_ENABLED=1` + toggle "Contrato (F4)" | validado (mod 04: /alf→/auth, arquitetura consistente) |
| WhisperX PT → `large-v2` | `WHISPERX_MODEL=large-v2` (`.env`) | validado |
| `initial_prompt` removido | — (revertido no `whisperx.js`) | fechado |

**Passos do commit (Bloco A):**
1. Branch a partir de `main` (não commitar direto na default).
2. `.env` é **gitignored** (tem segredos) — as flags são config de runtime; **documentar** as flags no README/`.env.example`, não commitar o `.env`.
3. **Spike/experiment files** (`server/ai/spike*.mjs`, `expWhisper*.mjs`, `regenModulo04.mjs`,
   `readingClarityPrompt.mjs`, `readingConsistency.mjs`, `docs/spike-out/`): **NÃO vão no commit de
   produção**. Mover para `server/ai/spike/` (ou `tools/`) e/ou `.gitignore`. Decidir (TD-7).
4. Mensagem de commit: convencional, escopo `feat(leitura)`, descrevendo F1-F4 + modelo + correção ancorada.

**Observação honesta:** a F1 (palpite do Qwen + ancoragem) é a parte **mais frágil** do Bloco A (o
CORRECOES do Qwen entra em loop/ruído). Ela **fica**, mas o **Bloco B (OCR) a supera** para código —
quando o OCR entrar, a F1 vira fallback só para cursos sem vídeo/tela útil.

---

## 2. BLOCO B — pipeline OCR (a construir)

### 2.1 Arquitetura validada (spikes provaram cada caixa)
```
Vídeo MP4
   │
   ▼  PySceneDetect (keyframes por mudança de cena, dedup)
Keyframes ──────────────┬───────────────────────────┐
   │ (código/texto)     │ (diagrama)                 │
   ▼                    ▼                            │
PaddleOCR (PP-OCRv6)   Qwen3-VL-8B (local)           │
identificadores exatos  JSON {type,notation,          │
(/auth, TokenService)   nodes,edges}                 │
   │                    │                            │
   └────────┬───────────┘                            │
            ▼ (agrega por curso/módulo, cacheia)      │
   VOCABULÁRIO CANÔNICO         +        DIAGRAMAS ESTRUTURADOS
            │                                     │
            ├─ (1) corrige a transcrição na fonte │ (3) → Mermaid fiel na leitura
            └─ (2) alimenta o contrato (F4)       │
                          │                        │
   WhisperX (transcrição, large-v2) ──► DeepSeek gera a leitura ◄──┘
```
**Não precisa de timestamp por palavra** (o casamento garble↔vocabulário é por texto/contexto).

### 2.2 Módulos novos (sugestão: `server/ai/ocr/`)
- `keyframes.mjs` — extrai keyframes (PySceneDetect via python, ou ffmpeg `select='gt(scene,X)'` +
  fallback fps). Dedup de frames quase-iguais. Retorna lista de PNG (1920×1080).
- `visionServer.mjs` — ciclo de vida do **Qwen3-VL** no llama-server (espelha `qwenServer.js`):
  `-m Qwen3VL-8B-Q4_K_M.gguf --mmproj mmproj-...F16.gguf` na porta 8081. **Revezamento de VRAM**
  (WhisperX ↔ Qwen3.5-texto ↔ Qwen3-VL ↔ Kokoro — só 1 modelo GPU por vez nos 11GB).
- `paddle.mjs` — chama o **PaddleOCR** (env conda `paddleocr`, python 3.11) via child_process.
  **`FLAGS_use_mkldnn=0`** (bug oneDNN CPU), `use_doc_orientation_classify=False`,
  `use_doc_unwarping=False`, `.predict()` (API 3.x). CPU (não disputa GPU). Retorna linhas de texto.
- `frameRouter.mjs` — decide **código vs diagrama** por frame. Heurística barata: PaddleOCR já dá
  contagem/densidade de linhas de texto → muita linha monospace = código; poucas linhas + muitas
  formas = diagrama (manda pro VL). (Alternativa: 1 classificação barata no próprio VL.)
- `extractVocabulary.mjs` — dos textos do PaddleOCR, extrai identificadores (regex: CamelCase,
  `/rotas`, `metodo()`, snake_case, `pacote.qualificado`, `Arquivo.ext`) → dedup → vocabulário canônico.
  Limpa ruído (ex.: o `©` do ícone de anotação do IntelliJ).
- `extractDiagram.mjs` — VL → JSON `{type,notation,nodes,edges}` → valida schema → gera Mermaid.
- `ocrCorrect.mjs` — aplica o vocabulário à transcrição (correção **ground-truth**; substitui a
  ancoragem heurística da F1). Casa garble↔canônico por similaridade **ancorada na tela** (o `to`
  veio do OCR, não do palpite). Determinístico + auditável.
- `ocrStore.mjs` — **cache** por vídeo (hash do arquivo/tamanho): vocabulário + diagramas. OCR roda
  **1× por vídeo** e reusa. Local: `<COURSES_PATH>/.ocr-cache/<hash>.json`.

### 2.3 Integração no fluxo
- **Nova fase no lote** (`generateReadingBatch`), entre WhisperX e a pré-condensação: **fase OCR por
  curso** — extrai keyframes de cada vídeo, roteia, roda PaddleOCR/VL, agrega o vocabulário + diagramas
  do curso, cacheia. Reveza VRAM (sobe VL só na fase de diagrama; PaddleOCR no CPU).
- O **vocabulário** desce por 2 caminhos: (a) `ocrCorrect` corrige a transcrição **antes** da
  pré-condensação (beneficia leitura, prática, quiz, flashcards — tudo herda texto correto);
  (b) `buildContract` (F4) recebe os nomes canônicos **reais** (não mais o fingerprint ruidoso).
- Os **diagramas estruturados** entram na geração da leitura como **Mermaid fiel** ao desenhado (em vez
  de inferido só da fala).

### 2.4 O que o OCR SUPERA/aposenta
- **F1 (palpite do Qwen + stoplist + ancoragem/gates)**: para **código**, o OCR dá a verdade → a F1
  heurística vira **fallback** (cursos sem tela útil). Aposenta a stoplist manual (TD-1) e a briga de
  gates (TD-13) para o caso de código/diagrama.
- **Fingerprint CORRECOES do Qwen** (que entra em loop/ruído): substituído por vocabulário do OCR.
- **F4 contrato**: os nomes canônicos passam a vir do **OCR (ground-truth)**, muito mais confiáveis.

### 2.5 Fases do Bloco B (por valor/risco, cada uma atrás de flag `OCR_*`)
- **O1 — PaddleOCR de código → vocabulário → corrige transcrição + contrato.** Maior valor (mata a
  classe do `/alf`). Flag `OCR_TEXT_ENABLED`. Beneficia todos os materiais.
- **O2 — Qwen3-VL diagrama → estrutura → Mermaid fiel.** Enriquecimento (modelagem/arquitetura).
  Flag `OCR_DIAGRAM_ENABLED`.
- **O3 — orquestração/cache/roteador + revezamento de VRAM** (produção robusta; PySceneDetect,
  dedup, cache por vídeo).

---

## 3. Dependências / setup de produção
- **PaddleOCR**: env conda `paddleocr` (python 3.11) já criado; `paddlepaddle` CPU + `paddleocr` 3.7
  (PP-OCRv6). Rodar com `FLAGS_use_mkldnn=0`. Documentar no setup.
- **Qwen3-VL-8B**: `Qwen3VL-8B-Instruct-Q4_K_M.gguf` + `mmproj-Qwen3VL-8B-Instruct-F16.gguf` em
  `/mnt/nvme2/llm/models/` (já baixados). llama.cpp com `--mmproj`/`libmtmd` (já tem).
- **ffmpeg** (já é dep). **PySceneDetect**: `pip install scenedetect` (no env conda, opcional; ffmpeg
  scene-filter serve de fallback).
- **VRAM 11GB (RTX 2080 Ti)**: só 1 modelo GPU por vez. Ordem de revezamento: WhisperX (transcrição)
  → Qwen3.5 (pré-condensação) → Qwen3-VL (diagramas) → Kokoro (áudio). PaddleOCR no CPU (fora da briga).

---

## 4. Decisões em aberto (pro usuário)
- **Roteador código×diagrama**: heurística por densidade de texto (barato) ou classificação no VL (mais preciso, +1 call)?
- **PaddleOCR CPU vs GPU**: CPU é seguro (fora do revezamento) e rápido o bastante para keyframes; GPU só se precisar de escala.
- **Onde a correção OCR age**: na transcrição (fonte, beneficia tudo) — recomendado — e/ou só no contrato?
- **Spike files**: mover para `server/ai/spike/`, `.gitignore`, ou apagar?
- **F1 heurística**: manter como fallback (cursos sem tela) ou desligar quando OCR estiver on?

---

## 5. Ordem de execução sugerida
1. **Commit do Bloco A** (branch + mensagem convencional; excluir spikes/segredos; documentar flags).
2. **O1** — PaddleOCR código → vocabulário → corrige transcrição + contrato (o grande ganho).
3. **O2** — Qwen3-VL diagramas → Mermaid fiel.
4. **O3** — cache, roteador, revezamento de VRAM, PySceneDetect.
5. A cada fase: validar num módulo real + leitura humana; só então ligar por default.

---

## 6. Estado do repositório
- `prompts.js` (núcleo): tocado na F2/F3 (blocos condicionais; off = original).
- Bloco A: 9 arquivos de produção modificados, **não commitados**, atrás de flag.
- Spikes/experimentos (untracked): `spike*.mjs`, `expWhisperInitialPrompt.mjs`, `spikeOcrVL.mjs`,
  `spikeVLdual.mjs`, `spikeTextAB.mjs`, `regenModulo04.mjs`, `readingClarityPrompt.mjs`,
  `readingConsistency.mjs`, `docs/spike-out/`. Ferramentas — decidir destino (item 4).
- Modelos locais: Qwen3.5-9B (texto), Qwen3-VL-8B + mmproj (diagrama) em `/mnt/nvme2/llm/models/`.
- Env conda `paddleocr` criado (PP-OCRv6).
