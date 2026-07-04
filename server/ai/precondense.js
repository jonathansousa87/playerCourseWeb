// Pre-condensacao LOCAL (opcional) das transcricoes, ANTES do DeepSeek.
//
// Roda um modelo local barato (llama-server, OpenAI-compatible) que LIMPA a fala
// — muletas, hesitacoes, narracao de digitacao no IDE — preservando todo o
// conteudo tecnico, SEM modernizar e SEM traduzir. O texto enxuto resultante
// vira o input do DeepSeek (a etapa cara), que faz o trabalho fino: estrutura,
// diagramas, modernizacao e traducao. Medido em ~50-60% menos input por aula.
//
// Atras de flag (PRECONDENSE_ENABLED, off por default). Se o servidor local
// estiver fora ou falhar, DEGRADA GRACIOSAMENTE: devolve a transcricao original
// (o DeepSeek ainda gera a aula, so com mais tokens) e LOGA o aviso — nunca
// quebra o pipeline nem some em silencio.
//
// Pre-requisito: subir o llama-server separadamente (ver /mnt/nvme2/llm/start.sh
// no setup do spike). Como usa a GPU, rode-o so APOS o WhisperX terminar a
// transcricao (a fase 0 do gerador ja roda antes desta etapa).

import { getCachedPrecondense, setCachedPrecondense } from './precondenseStore.js';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';

const truthy = (v) => /^(1|true|yes|on)$/i.test((v || '').trim());

const ENABLED = truthy(process.env.PRECONDENSE_ENABLED);
const URL = (process.env.PRECONDENSE_URL || 'http://127.0.0.1:8080/v1/chat/completions').trim();
const MODEL = (process.env.PRECONDENSE_MODEL || 'local').trim();
const MAX_TOKENS = Math.max(512, parseInt(process.env.PRECONDENSE_MAX_TOKENS || '4096', 10));
const TEMPERATURE = Number.isFinite(Number(process.env.PRECONDENSE_TEMPERATURE))
  ? Number(process.env.PRECONDENSE_TEMPERATURE) : 0.1;
// Transcricoes muito curtas nao valem o roundtrip (e a "limpeza" rende pouco).
const MIN_CHARS = Math.max(0, parseInt(process.env.PRECONDENSE_MIN_CHARS || '400', 10));
const TIMEOUT_MS = Math.max(10_000, parseInt(process.env.PRECONDENSE_TIMEOUT_MS || '300000', 10));

export const preCondenseEnabled = () => ENABLED;

// Prompt em INGLES de proposito: o modelo local (Qwen-9B) segue instrucao em
// ingles de forma mais consistente que em portugues. A SAIDA, porem, mantem o
// idioma da transcricao (nao traduz) — quem traduz e o DeepSeek depois.
const SYSTEM = `You receive the TRANSCRIPT of a technical programming video lesson (the instructor's speech, automatically transcribed). Convert this SPOKEN text into a READING text: the same content and the same didactic flow, rewritten as reading prose, WITHOUT the conversational tone. Rules:
- REMOVE the orality: filler words, hesitations, typing self-corrections ('oops, wrong'), direct address to the student ('see?', 'got it?', 'okay so far?', 'remember this?') and the step-by-step narration of typing in the IDE ('I'll put this here', 'let me see', 'up here'). Instead of narrating the typing, DESCRIBE what the code does and what is being built.
- STAY FAITHFUL: preserve all technical content (concepts, names of classes/methods/annotations, code, JPQL/SQL, steps, examples and warnings) and the teaching order. You rewrite the TONE, never change the CONTENT.
- DO NOT MODERNIZE: reproduce the APIs, versions and practices exactly as taught, even if outdated. Do not swap them for modern equivalents and do not add anything that was not said (modernization is handled later, by another stage).
- DO NOT INFER OR COMPLETE. If the instructor considered an alternative and discarded it, record only the final decision. Reproduce identifiers (parameters, variables, values, routes) EXACTLY as he decided to use them. Describe behavior exactly as stated (a LIKE with '%' on both sides means 'contains', not 'starts with'). Never name a class, method or exception that he did not explicitly mention.
- DO NOT TRANSLATE: keep the SAME language as the transcript. Keep technical terms as they were spoken.
- Do not comment or add your own headings/conclusions. Respond ONLY with the reading text.`;

// Pre-condensa UM texto de transcricao. Retorna sempre uma string utilizavel:
// o texto limpo se deu certo, ou o original (inalterado) se desligado, curto
// demais, ou se a chamada falhou.
//
// `enabled` permite ligar/desligar por chamada (a UI do "Gerar leitura" manda
// um checkbox por execucao). Quando omitido, cai no flag global do .env.
export const preCondense = async (text, enabled = ENABLED) => {
  const input = (text || '').trim();
  if (!enabled || input.length < MIN_CHARS) return text;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: input },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
    }
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error('resposta sem content');
    return out;
  } catch (err) {
    // Degrada gracioso: usa o original, mas deixa o aviso visivel no log.
    console.warn(`[precondense] falhou (${err.message}); usando a transcricao original sem pre-condensar`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
};

// preCondense COM cache persistente (content-addressed). Reusa o resultado do Qwen
// entre execucoes: reprocessar um modulo no DeepSeek NAO re-condensa (nem precisa
// do Qwen no ar). So grava no cache quando o Qwen REALMENTE condensou (se ele
// falhar/degradar pro original, nao cacheia, pra tentar de novo depois).
// `ensureReady` (opcional): callback async chamado SO quando vai mesmo condensar
// (cache miss + habilitado). Memoizado pelo chamador pra subir o Qwen UMA vez e
// SO se necessario — se tudo estiver em cache, o Qwen nem sobe. Deve retornar
// true se o Qwen esta pronto; false -> degrada pro texto cru.
export const preCondenseCached = async (text, enabled = ENABLED, coursesPath, ensureReady) => {
  const raw = (text || '').trim();

  // CACHE PRIMEIRO: se ja foi condensado antes, usa — MESMO com o Qwen desligado.
  // Assim da pra reprocessar um modulo no DeepSeek sem o Qwen no ar.
  if (raw.length >= MIN_CHARS) {
    const cached = await getCachedPrecondense(coursesPath, raw);
    if (cached != null) return cached;
  }

  // Sem cache: so condensa se o Qwen estiver habilitado; senao devolve o cru.
  if (!enabled || raw.length < MIN_CHARS) return text;

  // Cache miss real -> agora sim garante o Qwen no ar (sobe sob demanda, 1x).
  if (ensureReady && !(await ensureReady())) return text;

  const out = await preCondense(text, true);
  if (out && out !== text) await setCachedPrecondense(coursesPath, raw, out);
  return out;
};

// ============================================================================
// F1 — NORMALIZACAO de erros de transcricao (WhisperX) por MODULO.
//
// O texto pre-condensado ainda carrega mis-transcricoes de termos tecnicos
// (ex.: WhisperX ouve "auth" como "/alf", "DFD" como "dft"). A FIDELIDADE do
// DeepSeek propaga esse lixo. Aqui o Qwen local PROPOE correcoes obvias, o
// DeepSeek VETA (trava de seguranca contra corromper palavras legitimas) e
// aplicamos DETERMINISTICO (word-boundary) ao texto — antes do DeepSeek.
//
// NAO vai pro cache content-addressed (o mapa e especifico do modulo/curso; o
// cache e reusado entre contextos). Aplica-se em MEMORIA, por modulo. Atras da
// flag PRECOND_NORMALIZE_ENABLED, off por default. Degrada gracioso: Qwen fora
// -> mapa vazio -> texto passa intacto.
// ============================================================================

export const normalizeEnabled = () => truthy(process.env.PRECOND_NORMALIZE_ENABLED);

// Aplica o mapa de forma DETERMINISTICA — so tokens INTEIROS (word-boundary),
// pra nunca corromper uma ocorrencia legitima (ex.: "alf" dentro de "alfa").
export const applyNorm = (text, map) => {
  let out = text;
  for (const { from, to } of map || []) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\w])${esc}(?![\\w])`, 'g'), to);
  }
  return out;
};

// FIX B — trava DETERMINISTICA sobre o vet (que e estocastico e as vezes permissivo:
// ja deixou passar "data->Collect", que corromperia um curso de Data Modeling). NUNCA
// deixamos uma palavra COMUM virar `from` de uma correcao — independente do que o vet
// disser. Word-boundary + troca global numa palavra comum = corrupcao garantida.
const NORM_STOPWORDS = new Set([
  'data', 'set', 'get', 'post', 'put', 'user', 'up', 'down', 'plus', 'minus', 'length',
  'size', 'foot', 'staff', 'list', 'name', 'type', 'value', 'key', 'item', 'field', 'line',
  'point', 'table', 'base', 'case', 'main', 'end', 'start', 'run', 'test', 'code', 'file',
  'path', 'node', 'map', 'call', 'time', 'date', 'text', 'word', 'part', 'step', 'flow',
  'unit', 'task', 'role', 'rule', 'note', 'link', 'tool', 'mode', 'area', 'side', 'kind',
  'sort', 'load', 'save', 'edit', 'view', 'form', 'page', 'class', 'object', 'method',
  'event', 'count', 'index', 'order', 'group', 'level', 'state', 'to', 'is', 'as', 'of', 'in',
]);

// Consolida as linhas "CORRECOES:" dos fingerprints num mapa unico (dedup).
// IDENTICO ao spikeReadingModuleV2.mjs: `|| ''` (nao varre o texto todo) + guarda
// de vazio/traco (senao o proprio rotulo "CORRECOES" vaza como par falso). ALEM
// disso (Fix B) descarta qualquer `from` que seja palavra comum (NORM_STOPWORDS).
const collectNorm = (fingerprints) => {
  const map = []; const seen = new Set();
  for (const fp of fingerprints) {
    const line = (fp.match(/CORRECOES:\s*(.+)/i) || [])[1] || '';
    if (/^\s*-?\s*$/.test(line)) continue;
    for (const pair of line.split(/[,;]/)) {
      const m = pair.match(/([\w/@.\-]{2,})\s*->\s*([\w/@.\-]{2,})/);
      if (!m) continue;
      const from = m[1].trim(), to = m[2].trim();
      if (from.toLowerCase() === to.toLowerCase()) continue;
      if (NORM_STOPWORDS.has(from.toLowerCase())) continue; // Fix B: nunca troca palavra comum
      if (seen.has(from.toLowerCase())) continue;
      seen.add(from.toLowerCase()); map.push({ from, to });
    }
  }
  return map;
};

// Qwen local extrai o FINGERPRINT tecnico de UMA aula (4 linhas: TERMOS/ARTEFATOS/
// ABORDAGEM/CORRECOES). IDENTICO ao `qwenExtract` do spikeReadingModuleV2.mjs — as
// correcoes saem ANCORADAS no resto do fingerprint (mais confiaveis que pedir so a
// lista isolada). O fingerprint completo tambem alimenta o contrato da F4.
export const qwenExtract = async (text) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        model: MODEL, temperature: 0.1, max_tokens: 400, stream: false,
        messages: [
          { role: 'system', content: 'This text was auto-transcribed from a VIDEO (speech-to-text), so some DOMAIN/TECHNICAL terms may be GARBLED (a non-standard word that, in context, is clearly a mis-heard known term — a tool, notation, method, class, endpoint, ingredient, etc.). NEVER assume the domain (programming, modeling/diagrams, cooking, finance...). Extract a COMPACT fingerprint from ONE lesson. Output EXACTLY these 4 lines, nothing else, values in Portuguese:\nTERMOS: <comma list of the tools/notations/methods/frameworks/named concepts used>\nARTEFATOS: <comma list of the concrete named things the lesson creates or uses (classes, endpoints, entities, diagram types, notations, symbols, recipes...), with their REAL names>\nABORDAGEM: <one short line: the key technique/method/notation-choice the lesson teaches, incl. any convention it fixes (e.g. a notation variant, a naming style)>\nCORRECOES: <speech-to-text errors of domain/technical terms, as "wrong->right" pairs separated by comma (e.g. "alf->auth"); be CONSERVATIVE — only OBVIOUS ones; if none, "-">' },
          { role: 'user', content: text.slice(0, 6000) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } catch (e) { return `(extracao falhou: ${e.message})`; } finally { clearTimeout(t); }
};

// DeepSeek VETA os candidatos: mantem so os que sao claramente mis-transcricao E
// seguros de trocar como palavra inteira. Prefere DESCARTAR a arriscar corromper.
// thinking OFF (chamada estruturada JSON — o modelo e thinking e senao devolve vazio).
const vetNormMap = async (candidates, contextTitle, model = DEFAULT_MODEL) => {
  if (!candidates.length) return { keep: [], usage: null };
  const { content, usage } = await chatCompletion({
    system: 'You VET candidate speech-to-text corrections for a technical course auto-transcribed from video. KEEP a correction ONLY if BOTH: (a) "from" is clearly a garbled/mis-heard version of the technical term "to"; AND (b) replacing "from" as a WHOLE WORD across the text is SAFE and will NOT corrupt legitimate occurrences. DROP it when "from" is a common word that also appears legitimately (e.g. "Up", "Plus", "user", "set"), a proper-name guess, a translation, or anything uncertain. Prefer dropping over risking corruption. Reply ONLY pure JSON.',
    user: `Course/module: ${contextTitle}\nCandidate corrections (from -> to):\n${candidates.map((c) => `${c.from} -> ${c.to}`).join('\n')}\n\nReturn JSON: {"keep": [{"from":"...","to":"..."}]} with ONLY the safe, high-confidence technical corrections.`,
    model, temperature: 0, maxTokens: 800, responseFormat: { type: 'json_object' }, thinking: { type: 'disabled' },
  });
  let keep = [];
  try { keep = (JSON.parse(content).keep || []).filter((k) => k && k.from && k.to && k.from.toLowerCase() !== k.to.toLowerCase()); } catch { /* JSON invalido -> nao aplica nada (seguro) */ }
  return { keep, usage };
};

// Orquestra a normalizacao de um MODULO — MESMA ORDEM do spikeReadingModuleV2.mjs
// (ETAPA A -> A.5): Qwen extrai o fingerprint de cada aula -> collectNorm junta as
// linhas CORRECOES -> DeepSeek VETA -> devolve o mapa seguro. `texts` = textos JA
// pre-condensados. Requer Qwen no ar (o chamador garante); Qwen fora -> mapa vazio.
// Retorna { map, candidates, usage, fingerprints } — os fingerprints tambem servem
// ao contrato/planejador da F4 (reuso, sem re-extrair).
// Tira pontuacao das bordas ("/auth" -> "auth", "alf," -> "alf").
const bareTok = (s) => (s || '').replace(/^[^\w]+|[^\w]+$/g, '');

// FIX ANCORADO (F4 -> F1): um candidato do Qwen cujo `to` (forma bare) e um NOME
// CANONICO presente no CONTRATO e aplicado DIRETO — o contrato e o juiz, driblando o
// vet estocastico (que dropava tudo na lista ruidosa). Mata o `alf->auth` que o vet
// largava. Usa forma BARE (alf->auth) pra `/alf`->`/auth` E a variavel `alf`->`auth`
// funcionarem com word-boundary. So aplica se `to` aparece como token inteiro no contrato.
const anchorToContract = (candidates, contract) => {
  const out = [];
  if (!contract) return out;
  for (const c of candidates) {
    const to = bareTok(c.to); const from = bareTok(c.from);
    if (to.length < 2 || from.length < 2) continue;
    if (from.toLowerCase() === to.toLowerCase()) continue;
    if (NORM_STOPWORDS.has(from.toLowerCase())) continue;
    // O `to` tem que PARECER identificador tecnico: CamelCase (tem maiuscula) ou tem
    // caractere especial (/auth, client-id). Isso barra os comuns em minusculo
    // (username, password, service, equipe, monster) que o contrato tambem menciona
    // e que corromperiam texto PT legitimo. Mantem /auth (tem '/') e CamelCase.
    if (!/[A-Z]/.test(c.to) && !/[^\w]/.test(c.to)) continue;
    // Se o `from` (>=5 chars) JA aparece no contrato, e um TERMO REAL, nao um garble
    // (ex.: "Authentication" dentro de "AuthenticationManager") -> nao troca. Um garble
    // de verdade (alf, filterClance) nao esta no contrato. (>=5 evita acronimo curto tipo PL.)
    if (from.length >= 5 && contract.toLowerCase().includes(from.toLowerCase())) continue;
    const esc = to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![\\w])${esc}(?![\\w])`, 'i').test(contract)) out.push({ from, to });
  }
  return out;
};

// Une mapas dedup por `from` (case-insensitive; o primeiro vence).
const unionMaps = (...maps) => {
  const out = []; const seen = new Set();
  for (const m of maps) for (const p of m || []) {
    const k = p.from.toLowerCase();
    if (seen.has(k)) continue; seen.add(k); out.push(p);
  }
  return out;
};

// So a parte F1 a partir de fingerprints JA extraidos (collectNorm -> vet -> ancora no
// contrato). Assim o chamador extrai o fingerprint UMA vez e reusa. `contract` (F4,
// opcional): ancora as correcoes cujo `to` e nome canonico do contrato (mata o /alf).
export const normMapFromFingerprints = async ({ fingerprints, contextTitle, model = DEFAULT_MODEL, log = () => {}, contract = '' }) => {
  const candidates = collectNorm(fingerprints);
  if (!candidates.length) {
    log('[normalize] Qwen nao propos correcoes.');
    return { map: [], candidates: [], usage: null };
  }
  const { keep, usage } = await vetNormMap(candidates, contextTitle, model);
  const anchored = anchorToContract(candidates, contract);
  const map = unionMaps(keep, anchored);
  log(`[normalize] candidatos (Qwen): ${candidates.map((m) => `${m.from}->${m.to}`).join(', ')}`);
  log(`[normalize] vet manteve: ${keep.map((m) => `${m.from}->${m.to}`).join(', ') || '(nenhum)'}`);
  if (anchored.length) log(`[normalize] ANCORADO no contrato (F4): ${anchored.map((m) => `${m.from}->${m.to}`).join(', ')}`);
  log(`[normalize] aplicados (uniao): ${map.map((m) => `${m.from}->${m.to}`).join(', ') || '(nenhum)'}`);
  return { map, candidates, usage };
};

export const buildNormMap = async ({ texts, contextTitle, model = DEFAULT_MODEL, log = () => {} }) => {
  const fingerprints = [];
  for (const t of texts) fingerprints.push(await qwenExtract(t));
  const { map, candidates, usage } = await normMapFromFingerprints({ fingerprints, contextTitle, model, log });
  return { map, candidates, usage, fingerprints };
};

// ============================================================================
// F4 — CONTRATO de curso (consistencia entre aulas). Sintetiza, dos fingerprints
// + o nicho, UMA abordagem por escolha recorrente + os NOMES canonicos. Injetado
// em cada condensacao (o DeepSeek final usa os nomes canonicos -> corrige o
// `/alf`->`/auth` na geracao, mesmo sem a F1 pegar; ver docs/pesquisa-whisperx-erros.md).
// Codigo IDENTICO ao `buildContract` do spikeReadingModuleV2.mjs. Flag READING_CONTRACT_ENABLED.
// ============================================================================
export const contractEnabled = () => truthy(process.env.READING_CONTRACT_ENABLED);

export const buildContract = async (fingerprints, instruction, model = DEFAULT_MODEL) => {
  const { content, usage } = await chatCompletion({
    system: 'You write a COURSE CONTRACT that ALL reading lessons must follow so the course stays COHERENT end-to-end (lessons are generated independently and must not contradict each other). NEVER assume the domain (programming, modeling/diagrams, cooking, finance...). Based on what the course ACTUALLY covers (per-lesson fingerprints) and the modernization/niche target, decide: (1) for EACH recurring choice, ONE consistent option and FORBID the alternatives — this includes methods, notations/notation-variants, conventions, architectures, formats (e.g. in a modeling course: which DFD notation variant, consistent symbols; in an auth course: if it ISSUES its own tokens, forbid switching to OAuth2 Resource Server); (2) the CANONICAL name/spelling of each recurring artifact (entities, diagrams, notations, endpoints, classes, key terms) so the same thing is called the same across all lessons. Output a SHORT imperative contract in Brazilian Portuguese, ready to paste into every lesson prompt. No preamble.',
    user: `MODERNIZATION TARGET (nicho):\n"""\n${(instruction || '').slice(0, 3200)}\n"""\n\nPER-LESSON FINGERPRINTS:\n"""\n${fingerprints.join('\n---\n').slice(0, 12000)}\n"""\n\nWrite the course contract now (architecture decisions + canonical names).`,
    model, temperature: 0.2, maxTokens: 2000, thinking: { type: 'disabled' },
  });
  return { text: (content || '').trim(), usage };
};
