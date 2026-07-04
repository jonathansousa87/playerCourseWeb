# Pesquisa — erros de transcrição do WhisperX e como corrigir (2024–2026)

Feita antes de implementar a F4, pra embasar a abordagem com evidência (o filtro/stoplist da F1 é
**manual** — TD-1). Conclusão curta: **prevenir na fonte** (biasing do WhisperX) rende mais e mais
barato que corrigir depois, e a **correção deve ser ancorada num vocabulário CONHECIDO** — que é
exatamente o que o **contrato da F4** produz.

## 1. Como o WhisperX erra (padrões documentados)

- **Termos técnicos / nomes próprios / jargão**: erra de forma consistente (ex.: `auth`→`/alf`,
  `DFD`→`dft`, `Yourdon`→`jordan`). WER limpo do large-v3 ~2.7%, mas **8–12% no mundo real**; sobe
  muito com sotaque não-nativo e vocabulário de domínio.
- **Alucinação em silêncio**: em pausas longas / trechos sem fala, inventa texto plausível. Silêncio
  no começo/fim do áudio dispara alucinação.
- **Loops de repetição**: sob áudio ruidoso/mascarado ou fala repetida, o decoder entra em ciclo e
  repete frases centenas de vezes.
- **Já mitigado no projeto** (`server/ai/whisperx.js`): `--condition_on_previous_text False`, VAD
  (`vad_onset/offset`), `no_speech_threshold 0.6`, `logprob_threshold -1.0`,
  `compression_ratio_threshold 2.4`. Isso segue as boas práticas contra alucinação/loop. ✓

## 2. Prevenção na fonte — biasing do WhisperX (a maior alavanca)

- O CLI do WhisperX aceita **`--initial_prompt`** e **`--hotwords`** (repassados ao faster-whisper).
  Hoje o `buildArgs` do projeto **NÃO usa** nenhum dos dois.
- `initial_prompt`: um texto de contexto que enviesa o vocabulário/estilo ANTES de decodificar.
  Ganho medido: **~17% de redução relativa de WER** em domínio denso de jargão (comentário de NBA).
- **Restrições**: só os **últimos ≤224 tokens** contam, e a atenção pesa mais no FIM do prompt →
  o prompt tem que ser **compacto** e pôr os termos raros/de domínio **no final**. Usar **frase**,
  não lista solta ("Aula sobre Spring Security, JWT, TokenService, endpoint /auth" > "spring, jwt, auth").
- `--hotwords`: pra termos raros específicos que o initial_prompt não cobre bem.
- Alternativa mais forte (e mais cara): **TCPGen** (contextual biasing via prefix-tree, sem
  fine-tuning) — WER caiu de 27.8%→11.1% no Whisper-medium. Provavelmente overkill aqui.

## 3. Correção depois (LLM) — o que a literatura diz (valida e limita a nossa F1)

- **LLM post-correction ajuda MAIS quando o WER é alto (>10%)**; em transcrição já boa, **arrisca
  "desvio parafrástico"** (o modelo "melhora" e estraga). → valida manter o vet conservador + a
  aplicação **determinística word-boundary** + a stoplist. Não deixar o LLM reescrever solto.
- **Nomes ausentes da hipótese são difíceis de recuperar**: LLMs favorecem palavras de alta
  frequência, então introduzir um Named Entity que não está na transcrição é pouco confiável. →
  **explica por que o Qwen não propôs `alf→auth`**: o certo ("auth") não estava recuperável e o
  modelo puxa pro comum. Correção "às cegas" tem teto baixo.
- **RAG / vocabulário conhecido vence**: correção **ancorada num banco de entidades** (lista de
  nomes canônicos) supera o LLM adivinhando — mais segura (não inventa `data→Collect`) e mais capaz
  (recupera nomes ausentes). Métricas específicas: R-WER (rare-word), E-WER (entity).

## 4. Implicações para a F4 (reenquadramento)

O **contrato/fingerprint da F4 É o "banco de vocabulário conhecido"** que a pesquisa pede. Logo a F4
não é só "consistência entre aulas" — ela vira a fonte de verdade pra atacar o erro de transcrição
de duas formas melhores que a stoplist manual:

1. **Prevenção (novo):** os nomes canônicos do contrato (e/ou título do módulo + preset de nicho)
   alimentam o **`--initial_prompt`/`--hotwords`** do WhisperX → menos garble na fonte, em toda
   re-transcrição. Quick win imediato: usar **título do módulo + preset de nicho** como initial_prompt
   já ajuda, sem depender do contrato.
2. **Correção ancorada (melhora a F1):** em vez de "Qwen adivinha correções → vet → stoplist",
   passar a "mapeie garbles para ESTA lista canônica" (estilo RAG). Mais seguro e recupera
   `/alf→/auth` (que a F1 sozinha não pega, TD-5), aposentando a dependência da stoplist manual (TD-1).

**Ordem (chicken-and-egg):** o initial_prompt precisa dos termos ANTES de transcrever, mas o contrato
vem DEPOIS. Solução: (a) 1ª transcrição usa um hint barato (título+nicho); (b) contrato é derivado;
(c) contrato melhora correção das transcrições existentes E o initial_prompt de re-transcrições futuras.

## Fontes
- [How Accurate Is Whisper in 2026 (WER data)](https://novascribe.ai/how-accurate-is-whisper)
- [Careless Whisper: Speech-to-Text Hallucination Harms (arXiv 2402.08021)](https://arxiv.org/html/2402.08021v2)
- [OpenAI Whisper makes up words patients never said (Healthcare Brew, 2024)](https://www.healthcare-brew.com/stories/2024/11/18/openai-transcription-tool-whisper-hallucinations)
- [Accent errors in clinical speech + LLM remedy (npj Digital Medicine)](https://www.nature.com/articles/s41746-026-02490-z)
- [Contextual Biasing for domain vocab without fine-tuning (arXiv 2410.18363)](https://arxiv.org/html/2410.18363v1)
- [Whisper: Courtside Edition — LLM-driven context, 17% WER↓ (arXiv 2602.18966)](https://arxiv.org/html/2602.18966v1)
- [Improve Whisper accuracy with initial prompts (Sotto)](https://sotto.to/blog/improve-whisper-accuracy-prompts)
- [DeRAGEC: denoising NE candidates for ASR correction (arXiv 2506.07510)](https://arxiv.org/pdf/2506.07510)
- [Retrieval-Augmented Correction of Named Entity ASR Errors (arXiv 2409.06062)](https://arxiv.org/html/2409.06062v1)
- [FlanEC: Flan-T5 for post-ASR correction (arXiv 2501.12979)](https://arxiv.org/pdf/2501.12979)
- [WhisperX transcribe.py — initial_prompt/hotwords support](https://github.com/m-bain/whisperX/blob/main/whisperx/transcribe.py)
