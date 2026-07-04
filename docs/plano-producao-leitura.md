# Plano de produção — "Gerar Leitura" (clareza + consistência entre aulas)

> **HANDOFF.** Este doc é auto-suficiente: uma sessão nova deve conseguir retomar só com ele.
> **Nada disto está em produção.** `server/ai/prompts.js` está **intocado** (confirmado por `git status`).
> Todo o trabalho vive em arquivos de spike **novos** (untracked), listados na seção 4.

---

## 0. Como retomar (quick-start pra próxima sessão)

1. Leia as seções 1–3 (o problema e o que foi provado).
2. Rode a pipeline principal pra ver funcionando (seção 4.1):
   ```bash
   node server/ai/spikeReadingModuleV2.mjs \
     --course "Spring Rest-Construindo Web Services Poderosos" \
     --module "04. Avançando com a API - Spring Security e JWT" \
     --nicho java --out modulo04-v2
   ```
   Saída em `docs/spike-out/modulo04-v2/`.
3. Quando for implementar em produção, siga o plano faseado (seção 6). Comece pela **Fase 1**.

**Pré-requisitos do ambiente:**
- `.env` na raiz com `DEEPSEEK_API_KEY` e `COURSES_PATH=/mnt/nvme2/kadabra/Downloads/cursos/`.
- Qwen local: a app sobe/derruba sozinha via `server/ai/qwenServer.js` (`startQwen`/`stopQwen`),
  que roda `QWEN_START_CMD` (default `/mnt/nvme2/llm/start.sh`) e espera o `/health`. Endpoint
  default `http://127.0.0.1:8080` (`PRECONDENSE_URL`). Precisa da GPU livre. **Você não sobe nada à mão.**
- Modelo DeepSeek: `deepseek-v4-flash` (é **thinking** — ver caveats).

---

## 1. Contexto — os 3 problemas (não é um só)

Feedback real: uma aula de leitura de IoC/DI ficou **vaga** e o usuário teve que ir ao ChatGPT.
Investigando, apareceram **três problemas distintos**:

1. **Clareza** — o prompt atual prioriza fidelidade; se o professor explicou mal, a leitura fica
   igualmente vaga. Faltam frase-âncora, analogia, exemplo que *prova*, e fixação.
2. **Conexão entre aulas** — cada aula de leitura é condensada por uma **chamada DeepSeek
   independente**. Num curso build-along isso gera:
   - **drift de nomes**: `TokenService`↔`JwtTokenProvider`, `/alf`↔`/auth`, `SecurityConfig`↔`WebSecurityConfig`;
   - **contradição de arquitetura** (com o preset de nicho modernizando): uma aula ensinou OAuth2
     Resource Server e outra construiu filtro manual — arquiteturas incompatíveis no mesmo módulo.
3. **Erros de transcrição (WhisperX) propagados** — ex.: `/alf` é o WhisperX ouvindo "auth" errado
   (prova: `userPassAlf` = `userPassAuth`, variável do `UsernamePasswordAuthenticationToken`). A
   fidelidade propaga o lixo; o contrato pinaria o erro se não houver correção antes.

---

## 2. O que o spike PROVOU (validado, com evidência)

| Componente | O que faz | Validação |
|---|---|---|
| **Regra de CLAREZA** (agnóstica) | núcleo (problema→solução→frase-âncora→analogia) → exemplo que prova → subtópicos com exemplo → "## Fixando (teste-se)" | Boa em Java (IoC/DI, JWT) **e** modelagem (DFD/DER), com analogia do domínio certo |
| **Trava de CORREÇÃO técnica** | todo exemplo compila/roda; desambiguar 2 beans; não `new` em interface; termos precisos | Corrigiu os erros que a liberdade didática introduzia (`new DataSource()`, 2 `@Repository` sem qualifier) |
| **Qwen fingerprint** (por aula, local, grátis) | extrai TERMOS/ARTEFATOS/ABORDAGEM/CORREÇÕES | Funcionou em código **e** modelagem (pegou `dft→DFD`, `Gane-Sarson`, `Yourdon`) |
| **Normalização** (Qwen propõe → DeepSeek VETA → aplica determinístico) | corrige mis-transcrições técnicas óbvias sem corromper | Vet barrou os chutes (`Up→Docker`, `Plus→HasPay`); manteve os bons na modelagem |
| **Contrato de curso** (DeepSeek sintetiza dos fingerprints + nicho) | fixa UMA abordagem + nomes canônicos, injetado em toda condensação | Matou a contradição RS×filtro manual (validado 2×); pinou Gane-Sarson no curso de modelagem |
| **Planejador enriquecido** | recebe o fingerprint por aula, não só o título → agrupa por afinidade real | Grupos mais coesos = menos chamadas divergentes |

**Conclusão:** `clareza + (Qwen fingerprint → vet → contrato) + planejador enriquecido → condensação`
entrega aulas **claras E conectadas**, e **generaliza entre nichos** (código e modelagem).

### Caveats honestos (carregam pra produção)
- **Modelo-thinking frágil**: `deepseek-v4-flash` às vezes gasta o orçamento "pensando" e devolve
  vazio ("Resposta da DeepSeek sem content"). **Toda chamada estruturada (contrato, vet, plano JSON)
  precisa de `thinking: { type: 'disabled' }` + `maxTokens` folgado.**
- **Estocástico**: o contrato pode escolher nomes/notações levemente diferentes entre gerações;
  **dentro de uma geração é consistente** (e o curso é gerado uma vez).
- **Vet inconsistente mas seguro**: nunca aplicou correção que corrompe; às vezes rígido demais
  (largou `alf→auth` no Java — o contrato compensou pinando o endpoint).
- **Detector de drift automático NÃO é confiável** (lista fixa / string / Qwen linker over-agrupam;
  juiz LLM flash é instável). Serve só como sinal; **a validação real é leitura humana.**

---

## 3. Encaixe no código atual (onde produção seria alterada)

- `server/ai/precondense.js` — Qwen limpa cada aula (`preCondense` / `preCondenseCached`), atrás de
  `PRECONDENSE_ENABLED`. **Ponto de entrada da normalização e do fingerprint (Fases 1 e 4).**
- `server/ai/readingCourse.js` — `planGrouping` (Fase 1 do fluxo, ~L307), `condenseText` (~L388),
  `condenseLesson` (~L406), `generateReadingModule` (~L424).
- `server/ai/prompts.js` — `buildReadingCondensePrompt` (bloco **FIDELITY RULE**, ~L685),
  `instructionBlock` (~L37), `buildExemplosPrompt` (material de **prática**, ~L269).
- `server/ai/qwenServer.js` — `startQwen`/`stopQwen`/`isQwenUp`.
- `src/utils/instructionPresets.js` — presets de nicho (`INSTRUCTION_PRESETS`), já aplicados a
  leitura E prática. Chaves: `java, python, sql, arquitetura, modelagem, eng, vibe, spec, geral`.
- Cache pré-condensado: `<COURSES_PATH>/.precondense-cache/<sha1>.txt` (content-addressed pelo
  texto de `parseTranscript`). Módulo 04 do curso Spring está cacheado; o curso de modelagem NÃO
  (a pipeline cai no `parseTranscript` cru — funciona igual, só sem a limpeza do Qwen).

---

## 4. Inventário do spike — arquivos e COMO RODAR

Tudo em `server/ai/`, **untracked** (não afeta produção). Saídas em `docs/spike-out/`.
Custo por rodada: **centavos de DeepSeek**; Qwen local = grátis.

### 4.1 `spikeReadingModuleV2.mjs` — **A PIPELINE PRINCIPAL (use esta)**
O fluxo completo: sobe Qwen → fingerprint por aula → derruba Qwen → normalização (Qwen propôs,
DeepSeek veta, aplica) → contrato (DeepSeek) → planejador enriquecido → condensa cada aula com
**contrato + clareza + nicho** → checagem de consistência.
```bash
# Java/Spring (build-along):
node server/ai/spikeReadingModuleV2.mjs \
  --course "Spring Rest-Construindo Web Services Poderosos" \
  --module "04. Avançando com a API - Spring Security e JWT" \
  --nicho java --out modulo04-v2

# Modelagem (nicho diferente):
node server/ai/spikeReadingModuleV2.mjs \
  --course "Requirements Modeling Masterclass Flowcharts, BPMN 2.0, UML" \
  --module "5 - Data Modeling" --nicho modelagem --out modelagem-m5
```
Flags: `--course`, `--module`, `--nicho <chave|none>`, `--out <subpasta>`.
Saída em `docs/spike-out/<out>/`: `NN <slug>.md` (as aulas), `_fingerprints.txt`, `_normmap.txt`
(candidatos + vetados), `_contrato.md`. Imprime o plano, o contrato e a consistência. ~3-5 min
(startup do Qwen + N extrações). ~$0.01–0.015 DeepSeek.

### 4.2 `readingClarityPrompt.mjs` — **a regra de clareza (fonte única)**
Exporta `FIDELITY_BLOCK` (o bloco atual de produção), `CLARITY_BLOCK` (a regra nova) e
`buildClarityPrompt(args)` (monta o prompt de condensação trocando fidelidade→clareza). **É daqui
que sai o texto da regra de clareza pra Fase 3.** Não roda sozinho; é importado.

### 4.3 `spikeReadingClarity.mjs` — clareza numa aula só (A/B rápido)
Gera a aula de IoC/DI (fonte: aulas 06+07 do módulo 01) com a regra de clareza. Bom pra iterar a
regra rápido e barato. `node server/ai/spikeReadingClarity.mjs` → `docs/spike-out/iocdi__*.md`.

### 4.4 `spikeReadingModuleClarity.mjs` — módulo inteiro só com clareza (sem contrato)
Planejador + condensa cada aula com clareza + nicho, SEM o contrato. Mostra que clareza sozinha
não resolve o drift. `--module`, `--nicho`.

### 4.5 Experimentos anteriores (referência histórica, pode ignorar)
- `spikeReadingCondense.mjs`, `spikeReadingBatch.mjs`, `spikeReadingGrouped.mjs` — A/B da mudança
  mínima de fidelidade (evolução até a clareza).
- `spikeGlossaryContract.mjs` — 1ª versão do contrato (só nomes/glossário).
- `readingConsistency.mjs` + `spikeConsistencyScan.mjs` — detector de drift (camada 1 string +
  camada 2 Qwen). **Não confiável** (over-agrupa); serve só de sinal.
- `spikeLeakMeasure.mjs`, `spikeFaithfulness.mjs` — tentativas de MEDIR vazamento/fidelidade
  automaticamente. **Não confiáveis** (juiz flash instável). Conclusão: medir automático não vale;
  usar leitura humana.

---

## 5. A pipeline V2 explicada (o que virar produção na Fase 4)

Ordem exata (ver `spikeReadingModuleV2.mjs`):
1. **Carrega aulas** — `parseTranscript` + `getCachedPrecondense` (usa o pré-condensado do Qwen se cacheado).
2. **`startQwen()`** → pra cada aula, **`qwenExtract(pre)`** devolve 4 linhas
   (TERMOS/ARTEFATOS/ABORDAGEM/CORREÇÕES). **`stopQwen()`** (libera VRAM).
3. **Normalização**: `collectNorm` junta as linhas CORREÇÕES num mapa; **`vetNormMap`** (DeepSeek,
   thinking OFF) filtra só as seguras; `applyNorm` aplica determinístico (word-boundary) ao texto,
   ao fingerprint e ao título.
4. **`buildContract`** (DeepSeek, thinking OFF, maxTokens 2000) — sintetiza dos fingerprints + a
   instrução de nicho: fixa UMA abordagem por escolha recorrente + nomes canônicos.
5. **Planejador** (`buildReadingPlanPrompt`) — recebe o **título enriquecido** com o fingerprint.
6. **Condensa** cada grupo: `contractHeader + buildClarityPrompt({... instruction: nicho ...})`,
   `temperature 0.3`, `maxTokens 14000` (igual produção).
7. **Consistência** (camada 1 + teste de auth condicional) — só sinal, ler as aulas.

---

## 6. Plano faseado de produção (por valor/risco) — cada fase atrás de FLAG própria, off por default

### Fase 1 — Normalização de transcrição no Qwen · risco BAIXO · beneficia TODOS os materiais
- **O quê:** na pré-condensação, o Qwen também propõe correções de mis-transcrição (`alf→auth`,
  `dft→DFD`); DeepSeek VETA; aplica determinístico ao texto pré-condensado (que vai pro cache).
- **Onde:** `precondense.js` (estende o passo do Qwen; funções `collectNorm`/`applyNorm` e o
  `vetNormMap` existem em `spikeReadingModuleV2.mjs` — copiar de lá).
- **Flag:** `PRECOND_NORMALIZE_ENABLED`.
- **Por que 1º:** limpa a raiz; leitura, prática, quiz, flashcards herdam texto correto de graça.
  Determinístico + auditável (logar o mapa aplicado).
- **Validar:** rodar num módulo; conferir que `alf→auth` entra e `Up→Docker` não.

### Fase 2 — Trava de correção técnica · risco BAIXO · leitura + prática
- **O quê:** bloco "CORRECTNESS" no prompt (compila/roda; desambiguar; não `new` em interface;
  termos precisos). Texto pronto em `readingClarityPrompt.mjs` (dentro do `CLARITY_BLOCK`, seção
  CORRECTNESS) — dá pra extrair só esse bloco e aplicar sem a clareza.
- **Onde:** `buildReadingCondensePrompt` **e** `buildExemplosPrompt` (prática gera código que o aluno RODA).
- **Flag:** pode entrar direto (só endurece regra) ou `READING_CORRECTNESS`.

### Fase 3 — Regra de clareza na leitura · risco MÉDIO · atrás de flag
- **O quê:** trocar/estender o bloco FIDELITY RULE pela regra de CLAREZA (`CLARITY_BLOCK` de
  `readingClarityPrompt.mjs`).
- **Onde:** `buildReadingCondensePrompt` (`prompts.js`). Decidir: substituir o bloco OU virar
  **modo** (o usuário escolhe fidelidade × clareza por geração — ver decisões).
- **Flag:** `READING_CLARITY_ENABLED`. **A Fase 2 tem que estar junto** (clareza abre risco de código errado).
- **Validar:** gerar 2-3 aulas de nichos diferentes; leitura humana (o juiz é o usuário).

### Fase 4 — Fingerprint + contrato + planejador enriquecido · risco ALTO · atrás de flag
- **O quê:** a pipeline de consistência (seção 5) portada pro `readingCourse.js`.
- **Onde:** novo passo entre `planGrouping` e o loop de `condenseLesson`; o contrato desce por
  `condenseLesson`→`condenseText`; um `contractBlock` prepended no prompt. Código-fonte:
  `spikeReadingModuleV2.mjs` (funções `qwenExtract`, `collectNorm`/`vetNormMap`/`applyNorm`,
  `buildContract`).
- **Flag:** `READING_CONTRACT_ENABLED`. Entra **por último**, depois das Fases 1-3 estáveis.
- **Risco:** ALTO — mais chamadas, estocástico, depende do Qwen no ar + fragilidade do thinking.

---

## 7. O que se aplica ao material de PRÁTICA (`buildExemplosPrompt`)
Já é bom (niche-aware A1/A2/B, active recall, "por quê"). Do que estudamos:
- **SIM** — trava de correção (Fase 2): exercícios/soluções geram código que o aluno RODA.
- **SIM** — normalização (Fase 1): herda de graça (texto pré-condensado limpo).
- **SIM** — alinhar com a leitura: injetar o mesmo contrato (Fase 4) evita ensinar uma abordagem e
  exercitar outra.
- **NÃO** — estrutura de clareza (núcleo/analogia): é pra ENSINAR (leitura); prática é FAZER.
- **NÃO** — contrato de NOMES por aula isolada: prática é standalone (só importa o alinhamento com a leitura).

---

## 8. Decisões em aberto (pro usuário)
- **Normalização:** aplicar ao cache pré-condensado existente (reprocessar) ou só cursos novos?
- **Clareza:** substituir o bloco de fidelidade OU oferecer como **modo** (escolha por geração)?
- **Contrato:** por **curso** (ideal build-along) ou por **módulo** (mais simples)?
- **Custo:** Fases 1 e 4 adicionam chamadas DeepSeek por curso (centavos); Qwen local = grátis.

---

## 9. Estado do repositório (no fim desta investigação)
- `server/ai/prompts.js` (produção): **INTOCADO** (revertido; confere `git diff server/ai/prompts.js`).
- Novos (untracked): `server/ai/readingClarityPrompt.mjs`, `readingConsistency.mjs`,
  `spikeReading*.mjs`, `spikeGlossaryContract.mjs`, `spikeConsistencyScan.mjs`, `spikeLeakMeasure.mjs`,
  `spikeFaithfulness.mjs`; `docs/plano-producao-leitura.md`; `docs/spike-out/` (saídas — pode apagar).
- Memória do projeto: `project_reading_didatica_spike.md`.
