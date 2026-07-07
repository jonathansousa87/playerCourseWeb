# Roadmap — Melhorias de "Gerar Leitura" (clareza + consistência)

Plano-fonte detalhado: [`docs/plano-producao-leitura.md`](docs/plano-producao-leitura.md).
Spike validado (não toca produção): `server/ai/spikeReadingModuleV2.mjs` + `server/ai/spikeF1Audit.mjs`.

**Princípio:** cada fase entra **atrás de flag própria, off por default**, com degradação graciosa.
`server/ai/prompts.js` (núcleo) só é tocado a partir da **F2** — até a F1 ele fica **intocado**.
Portar o spike **fiel** (sem "melhorar" o que já foi validado).

---

## Fases

| Fase | O quê | Risco | Flag | Status |
|---|---|---|---|---|
| **F1** | Normalização de mis-transcrição (Qwen propõe → DeepSeek veta → aplica determinístico) | Baixo | `PRECOND_NORMALIZE_ENABLED=1` + toggle UI "Normalizar (F1)" default ON | `[x]` Implementada, **ATIVA** |
| **F2** | Trava de correção técnica (código/exemplo que roda; desambiguar; termos precisos) em leitura **e** prática | Baixo | `READING_CORRECTNESS=1` (env, global) | `[x]` Implementada, **ATIVA** |
| **F3** | Regra de clareza como **modo** (fidelidade × clareza, escolha por geração) | Médio | `READING_CLARITY_ENABLED=1` + toggle UI "Clareza (F3)" default ON | `[x]` Implementada, **ATIVA** |
| **F4** | Contrato de curso + fingerprint + planejador enriquecido + `initial_prompt` no Whisper (mata drift e `/alf`) | Alto | `READING_CONTRACT_ENABLED=1` + toggle UI "Contrato (F4)" default ON | `[x]` Implementada, **ATIVA** (contrato per-curso no lote — TD-14; per-módulo no fluxo individual) |
| **F5** | Estrutura/scaffolding: onde cada artefato vai no projeto e por quê, construção incremental passo a passo, genérico p/ qualquer nicho de tecnologia. Em leitura **e** prática | Baixo | `READING_STRUCTURE_ENABLED=1` (env, global) | `[x]` Implementada, **ATIVA** |

### F1 — detalhe e como testar
Checklist:
- [x] Primitivas no `precondense.js` (fiéis ao spike)
- [x] `buildModuleNormMap` extrai do **cru** (Fix A) e aplica em `condenseText`
- [x] Stoplist determinística `NORM_STOPWORDS` (Fix B)
- [x] Salt de cache `PRECONDENSE_CACHE_VERSION`
- [x] Backend por-execução (`normalize`) nas rotas + fluxo em lote
- [x] Toggle na UI "Normalizar (F1)"
- [x] Validado via `spikeF1Audit.mjs` (modelagem + Java)
- [x] Flags no `.env`
- [ ] Surfacar o mapa aplicado na UI / persistir (TD-4)
- [ ] Regenerar módulos 04/05 limpos com a F1 corrigida (TD-10)
- [ ] Leitura humana de um curso de modelagem gerado ponta-a-ponta
- [ ] Commit da F1

- **Onde:** `precondense.js` (`qwenExtract`/`collectNorm`/`vetNormMap`/`applyNorm`/`NORM_STOPWORDS`/`buildNormMap`),
  `readingCourse.js` (`buildModuleNormMap` → aplica em `condenseText`), `routes/ia.js` (campo `normalize`),
  UI `ReadingBatchScreen.jsx` + `readingGeneration.js` + `progressApi.js`.
- **Testar:** na tela de Gerar Leitura, deixe **"Condensar (Qwen)"** ligado e ligue **"Normalizar (F1)"**;
  ou `PRECOND_NORMALIZE_ENABLED=1` no `.env`. O mapa aplicado sai no **console do server** (`[normalize] ...`).
- **Validado (via `spikeF1Audit.mjs`, sem tocar produção):**
  - Modelagem (`5 - Data Modeling`): aplica `dft→DFD, erd→DER, Yourdon, Gane-Sarson`.
  - Java (`mod 04`): no-op seguro (vet barra `Up→Docker`, `Plus→HasPay`).
  - `data→Collect` (corromperia o curso): **bloqueado** pela stoplist (Fix B).
- **Correções de produção vs. port ingênuo:** (A) extrair correções do texto **CRU** (a limpeza do Qwen
  apaga o garble); (B) **stoplist determinística** sobre o vet estocástico.

### F2 — detalhe e como testar
- [x] `CORRECTNESS_BLOCK` **exato** do spike, definido em `prompts.js`
- [x] Injetado em `buildReadingCondensePrompt` **e** `buildExemplosPrompt` (primeiro toque no núcleo, atrás de flag)
- [x] Flag `READING_CORRECTNESS` (env, lida em tempo de chamada; bloco entra/sai — verificado)
- [x] Flag no `.env` (off por default)
- [ ] Validar no alvo concreto: regenerar a aula de JWT e conferir se some o `signWith(SignatureAlgorithm.HS256, …)` (API 0.11 que não compila com o `jjwt 0.12.5` declarado)
- [ ] Decidir se ganha toggle na UI ou entra default-on
- [ ] Commit da F2

**Testar:** `READING_CORRECTNESS=1` no `.env` → reiniciar server → regenerar. Vale pra leitura e prática.
**Nota:** sem toggle na UI (é global e só endurece a regra). `prompts.js` agora é tocado — mas só adiciona
um bloco condicional; com a flag off o prompt é **byte-a-byte** o de antes (verificado).

### F3 — detalhe e como testar
- [x] `FIDELITY_BLOCK` + `CLARITY_BLOCK` (texto exato do spike) em `prompts.js`; `buildReadingCondensePrompt` ganha `clarity` e troca o bloco internamente (sem `replace` externo)
- [x] Correctness não duplica: clareza já embute; fidelidade injeta via F2 (verificado — 1 ocorrência)
- [x] Threaded: `condenseText`/`condenseLesson`/`generateReadingModule*`/lote → rotas → UI (`readingGeneration.js`/`progressApi.js`)
- [x] Toggle na UI "Clareza (F3)" (default ON) + chip "Leitura: clareza/fidelidade"
- [x] Flag `READING_CLARITY_ENABLED=1` + F2 junto (`READING_CORRECTNESS=1`)
- [x] Verificado: modo troca FIDELITY↔CLARITY, `## O núcleo`/`## Fixando` aparecem na clareza; build passa
- [ ] Leitura humana de aulas geradas em clareza (nichos diferentes) — o juiz é você
- [ ] TD: clareza coexiste com "Recommended structure" do prompt (`## Resumo rapido` × `## Fixando`) — igual ao spike; refinar se incomodar
- [ ] Commit da F3

**Testar:** toggle "Clareza (F3)" (default on) ou `READING_CLARITY_ENABLED=1`. Off = modo fidelidade (comportamento antigo).

### F4 — detalhe e como testar
- [x] Fingerprint por aula (reusa `qwenExtract`, extraído UMA vez, do cru) em `buildModulePrep`
- [x] `buildContract` (port fiel do spike, DeepSeek thinking off) → `contractHeader` prepended no condense
- [x] Planejador enriquecido (`planGrouping` recebe fingerprints)
- [x] `initial_prompt` no WhisperX (TD-12): título do curso+módulo como hint de domínio
- [x] Flag `READING_CONTRACT_ENABLED=1` + toggle UI "Contrato (F4)" (default on, exige Qwen)
- [x] Validado via `spikeF1Audit.mjs --contract`: contrato pina `/auth`, nomes canônicos, trava arquitetura (mod 04)
- [x] `initial_prompt`: **decidido = título** (TD-12); vocab-de-nicho e contrato-fed descartados (re-transcrição não vale)
- [x] **TD-14**: contrato **por curso** no lote (fase 1.9 do `generateReadingBatch`) — agrega fingerprints de todos os módulos + OCR canônico do curso, gera 1 contrato, passa via `contractText`; fallback pro per-módulo
- [ ] Contrato injetado também na **prática** (`buildExemplosPrompt`) p/ alinhar leitura × prática
- [ ] Leitura humana: regenerar mod 04 e conferir que some o `/alf` e a contradição RS×filtro
- [ ] Commit da F4

**Testar:** toggle "Contrato (F4)" (default on, precisa do Qwen) ou `READING_CONTRACT_ENABLED=1`. Log `[contract] F4 gerado`.

---

### F5 — detalhe e como testar
Motivação: leitura gerada ficava só "código + explicação teórica", sem dizer ONDE cada
arquivo/pacote/classe entra no projeto nem construir passo a passo — o leitor tinha que
adivinhar (ex.: em qual pacote a interface vai, o que fica no service vs repository).
- [x] `STRUCTURE_BLOCK` (server/ai/prompts.js): exige local explícito de cada artefato
  criado + o porquê (papel na arquitetura), construção incremental (conecta com o passo
  anterior), explicita convenções implícitas. GENÉRICO (não hardcoded pra nenhuma stack).
- [x] Injetado em `buildReadingCondensePrompt` (leitura) e `buildExemplosPrompt` (prática)
- [x] Flag `READING_STRUCTURE_ENABLED=1` (env, global; sem toggle UI — só endurece a regra)
- [x] Junto: extraído `VERSION_GUARD` (server/ai/prompts.js) como fonte única do guard de
  versão/modernização — antes duplicado (texto solto na leitura + outro na prática, que
  divergiam). Corrigido bug: `buildExemplosPrompt` já tinha `CORRECTNESS_BLOCK` (via
  `correctnessBlock()`) e uma injeção duplicada tinha sido adicionada por engano — removida.
- [ ] Validar em curso real (regenerar um módulo e conferir "onde criar o pacote X" aparece)
- [ ] Commit da F5

**Testar:** `READING_STRUCTURE_ENABLED=1` (já default no `.env`). Gere/regenere uma leitura
com criação de arquivo/classe/pacote e confira se o texto diz onde e por quê.

---

## Débitos técnicos (vamos ajustando)

| ID | Feito? | Débito | Origem | Sev. |
|---|---|---|---|---|
| TD-1 | `[ ]` | Vet do DeepSeek é **estocástico/permissivo** (deixou passar `data→Collect`). Mitigado pela stoplist `NORM_STOPWORDS`, mas ela é **manual e incompleta** — expandir e/ou trocar por heurística (ex.: não trocar palavra que existe em dicionário PT/EN). | F1 | Média |
| TD-2 | `[ ]` | `qwenExtract` (correções F1) **não é cacheado** — re-roda a cada geração. Qwen é local (grátis), mas custa tempo. Cachear por conteúdo. | F1 | Baixa |
| TD-3 | `[ ]` | Fluxo **Drive** faz `getFileContent` 2× quando F1 liga (extração lê cru + condense re-lê). Reusar via mapa in-memory. | F1 | Baixa |
| TD-4 | `[ ]` | Mapa de normalização aplicado só vai pro **console** — não visível na UI nem persistido. Surfacar (evento de progresso / `_normmap.txt`) pra auditoria e teste sem olhar stdout. | F1 | Média |
| TD-5 | `[x]` | `/alf`→`/auth`: a F1 não pega (Qwen nem propõe). **Resolvido pela F4**: o contrato pina `Endpoint → /auth` e o condense usa o nome canônico (validado no audit do mod 04). | F1→F4 | Média |
| TD-6 | `[ ]` | F1 **extrai do cru** mas **aplica no texto limpo** (mismatch intencional). Validar que não gera no-ops silenciosos indesejáveis; documentar. | F1 | Baixa |
| TD-7 | `[ ]` | Arquivos de spike (`spike*.mjs`, `readingConsistency.mjs`, `spikeF1Audit.mjs`) **untracked** em `server/ai/`. Decidir: manter como ferramentas, mover pra `spike/`, ou `.gitignore`. | Geral | Baixa |
| TD-8 | `[ ]` | Build do front emite warning de **chunk > 500 kB** (pré-existente, não da F1). Code-splitting. | Geral | Baixa |
| TD-9 | `[ ]` | `PRECONDENSE_CACHE_VERSION` vazio por default. Ao mudar o **prompt de pré-condensação**, lembrar de bumpar (senão serve cache stale). | F1 | Baixa |
| TD-10 | `[ ]` | Módulos 04/05 no disco foram gerados por uma **versão antiga/bugada da F1** — regenerar limpo. | F1 | Baixa |
| TD-11 | `[ ]` | Modo clareza (F3) **coexiste** com a "Recommended structure" do prompt (que pede `## Resumo rapido`); a clareza pede `## Fixando (teste-se)`. Igual ao spike (só troca o bloco de regra), mas pode gerar as duas seções. Avaliar na leitura humana e refinar se preciso. | F3 | Baixa |
| TD-12 | `[x]` | **initial_prompt REMOVIDO.** Experimentos (`expWhisperInitialPrompt.mjs`): título dá ganho marginal; vocab de nicho regride no java; preserve-EN **alucina** (rep5gram 0.474, loop). Nenhum vale. Quem fixa termos é o contrato (F4). `whisperx.js` revertido. | Whisper | Fechado (removido) |
| TD-13 | `[x]` | **Correção ANCORADA** (`anchorToContract` em `precondense.js`): candidato do Qwen cujo `to` é nome canônico do contrato é aplicado direto (bare `alf→auth`), driblando o vet instável. **3 travas de segurança**: (a) `to` parece identificador técnico (CamelCase/`/`); (b) `from` não é palavra comum (stoplist); (c) `from`≥5 chars que já está no contrato = termo real, não garble (mata o `Authentication→UserCredentials`). **VALIDADO**: mod 04 → `/alf`=0, `Authentication` (tipo) intacto. Resíduo: `from` curto de palavra real (pair/Mail/vim) — raro, baixo risco (→TD-17 OCR ou dicionário). | F4 | Implementado+validado |
| TD-15 | `[ ]` | **PT → `large-v2`** (era `large-v3-turbo`). Validado: v3 alucina ~4× mais que v2 (Deepgram); v2 mais preciso no termo (/alf 2 vs 4) e sem alucinação. `.env` `WHISPERX_MODEL=large-v2`. Só afeta NOVAS transcrições. EN (`distil-large-v3.5`) não testado — avaliar. | Whisper | Aplicado (.env) |
| TD-16 | `[ ]` | **Modelos 2026 (avaliação futura, troca MAIOR — sai do WhisperX)**: Voxtral Transcribe 2 (5.9% WER, PT, streaming), Qwen3-ASR (SOTA, 52 idiomas), NVIDIA Canary 1B v2 (3–5% europeias). Perdem alinhamento/VAD/flags do WhisperX → integração nova. | Whisper | Ideia |
| TD-17 | `[x]` | **OCR forte dos frames do vídeo (IMPLEMENTADO — Bloco B)**: PaddleOCR (PP-OCRv6, CPU) + Qwen3-VL (GPU) extraem identificadores EXATOS da tela → vocabulário canônico → corrige transcrição na fonte (ground-truth) + alimenta contrato (F4). Módulos em `server/ai/ocr/`. Flags `OCR_TEXT_ENABLED` (O1) + `OCR_DIAGRAM_ENABLED` (O2). Cache por vídeo. Supera a heurística da F1 para código. | F4/Whisper | Implementado |
| TD-14 | `[x]` | **Contrato PREFIXO por módulo** (refinou o per-curso): o contrato do módulo N cobre 01..N — o atual + os ANTERIORES que já têm cache (fingerprint+OCR), escaneando as pastas irmãs de índice menor (nunca os futuros, que podem não ter cache). Reprocessar só o N já fica coerente com 01..N-1 sem rodar os anteriores (só cache, nunca sobe o Qwen por eles). Módulo 01 = só ele. No lote os módulos rodam em ordem → a cadeia se forma sozinha. Cache do contrato (`contractStore.js`, content-addressed por instrução+OCR+fingerprints 01..N) → não re-chama o DeepSeek se o prefixo não mudou. Fatorados `buildOcrCanonical`/`extractFingerprints`/`rankModuleVocab`; `readCachedModuleOcr` usa o MESMO ranking da geração (senão a correção OCR diverge e a chave do fingerprint não bate — validado 19/19 no mód 04). Removida a fase 1.9 per-curso. Só fs (Drive = per-módulo). Falta rodar lote real e ler. | F4 | Implementado |

---

## Estado do repositório
- `server/ai/prompts.js` (núcleo): tocado na **F2** (correção) e **F3** (modo clareza) — blocos condicionais.
- **F1, F2, F3, F4 implementadas e ATIVAS por default** (flags `=1` no `.env` + toggles default-on),
  modificações na árvore de trabalho **não commitadas**. Falta: refinamentos (TD-14 per-curso, prática, per-course initial_prompt) + leitura humana + commit.

**Convenção:** marcar progresso com `[x]` (feito) e `[ ]` (aberto). Ao fechar um TD, trocar `[ ]`→`[x]`.
