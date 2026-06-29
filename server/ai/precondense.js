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
