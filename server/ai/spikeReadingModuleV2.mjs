// SPIKE — pipeline V2: Qwen extrai fingerprint tecnico por aula -> enriquece o
// planejador -> DeepSeek sintetiza um CONTRATO DE CURSO (abordagem unica + nomes
// canonicos) -> contrato injetado em CADA condensacao (com clareza + nicho).
// Objetivo: as aulas casarem (sem a contradicao Resource Server vs filtro manual).
// NAO altera producao. Qwen sobe/desce sozinho (startQwen/stopQwen).
//
// Uso: node server/ai/spikeReadingModuleV2.mjs [--module "..."] [--nicho java]

import '../load-env.js';
import { writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { READING_CONDENSE_SYSTEM, READING_PLAN_SYSTEM, buildReadingPlanPrompt } from './prompts.js';
import { buildClarityPrompt } from './readingClarityPrompt.mjs';
import { parseTranscript } from './generator.js';
import { getCachedPrecondense } from './precondenseStore.js';
import { extractArtifacts, stringClusterClasses } from './readingConsistency.mjs';
import { INSTRUCTION_PRESETS } from '../../src/utils/instructionPresets.js';
import { startQwen, stopQwen, isQwenUp } from './qwenServer.js';

const COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';
const LOCAL_URL = (process.env.PRECONDENSE_URL || 'http://127.0.0.1:8080/v1/chat/completions').trim();
const LOCAL_MODEL = (process.env.PRECONDENSE_MODEL || 'local').trim();
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const COURSE = arg('course', 'Spring Rest-Construindo Web Services Poderosos');
const MODULE = arg('module', '04. Avançando com a API - Spring Security e JWT');
const OUTNAME = arg('out', 'modulo04-v2');
const NICHO = arg('nicho', 'java');
const PRESET = NICHO === 'none' ? null : INSTRUCTION_PRESETS.find((p) => p.key === NICHO);
const INSTRUCTION = PRESET ? PRESET.text : '';
const OUT = resolve(`docs/spike-out/${OUTNAME}`);
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Aplica um mapa de normalizacao de forma DETERMINISTICA (so tokens inteiros).
const applyNorm = (text, map) => {
  let out = text;
  for (const { from, to } of map) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\w])${esc}(?![\\w])`, 'g'), to);
  }
  return out;
};
// Consolida as linhas "CORRECOES:" que o Qwen propos num mapa unico (dedup).
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
      if (seen.has(from.toLowerCase())) continue;
      seen.add(from.toLowerCase()); map.push({ from, to });
    }
  }
  return map;
};

// --- Qwen local: extrai o fingerprint tecnico de UMA aula ---
const qwenExtract = async (text) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(LOCAL_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        model: LOCAL_MODEL, temperature: 0.1, max_tokens: 400, stream: false,
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

// --- DeepSeek: sintetiza o CONTRATO DE CURSO a partir dos fingerprints + nicho ---
const buildContract = async (fingerprints, instruction) => {
  const { content, usage, model } = await chatCompletion({
    system: 'You write a COURSE CONTRACT that ALL reading lessons must follow so the course stays COHERENT end-to-end (lessons are generated independently and must not contradict each other). NEVER assume the domain (programming, modeling/diagrams, cooking, finance...). Based on what the course ACTUALLY covers (per-lesson fingerprints) and the modernization/niche target, decide: (1) for EACH recurring choice, ONE consistent option and FORBID the alternatives — this includes methods, notations/notation-variants, conventions, architectures, formats (e.g. in a modeling course: which DFD notation variant, consistent symbols; in an auth course: if it ISSUES its own tokens, forbid switching to OAuth2 Resource Server); (2) the CANONICAL name/spelling of each recurring artifact (entities, diagrams, notations, endpoints, classes, key terms) so the same thing is called the same across all lessons. Output a SHORT imperative contract in Brazilian Portuguese, ready to paste into every lesson prompt. No preamble.',
    user: `MODERNIZATION TARGET (nicho):\n"""\n${instruction.slice(0, 3200)}\n"""\n\nPER-LESSON FINGERPRINTS:\n"""\n${fingerprints.join('\n---\n').slice(0, 12000)}\n"""\n\nWrite the course contract now (architecture decisions + canonical names).`,
    model: DEFAULT_MODEL, temperature: 0.2, maxTokens: 2000, thinking: { type: 'disabled' },
  });
  return { text: content.trim(), cost: costFromUsage(usage, model) };
};

// --- DeepSeek VETA o mapa de normalizacao proposto pelo Qwen (trava de seguranca) ---
const vetNormMap = async (candidates, contextTitle) => {
  if (!candidates.length) return { keep: [], cost: 0 };
  const { content, usage, model } = await chatCompletion({
    system: 'You VET candidate speech-to-text corrections for a technical course auto-transcribed from video. KEEP a correction ONLY if BOTH: (a) "from" is clearly a garbled/mis-heard version of the technical term "to"; AND (b) replacing "from" as a WHOLE WORD across the text is SAFE and will NOT corrupt legitimate occurrences. DROP it when "from" is a common word that also appears legitimately (e.g. "Up", "Plus", "user", "set"), a proper-name guess, a translation, or anything uncertain. Prefer dropping over risking corruption. Reply ONLY pure JSON.',
    user: `Course/module: ${contextTitle}\nCandidate corrections (from -> to):\n${candidates.map((c) => `${c.from} -> ${c.to}`).join('\n')}\n\nReturn JSON: {"keep": [{"from":"...","to":"..."}]} with ONLY the safe, high-confidence technical corrections.`,
    model: DEFAULT_MODEL, temperature: 0, maxTokens: 800, responseFormat: { type: 'json_object' }, thinking: { type: 'disabled' },
  });
  let keep = [];
  try { keep = (JSON.parse(content).keep || []).filter((k) => k && k.from && k.to && k.from.toLowerCase() !== k.to.toLowerCase()); } catch { /* mantem vazio se JSON falhar */ }
  return { keep, cost: costFromUsage(usage, model) };
};

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const dir = join(COURSES_PATH, COURSE, MODULE);
  const files = (await readdir(dir)).filter((f) => /_dub\.txt$/.test(f)).sort();
  const lessons = [];
  for (let id = 0; id < files.length; id++) {
    const path = join(dir, files[id]);
    const p = await parseTranscript(path);
    lessons.push({ id, path, title: files[id].replace(/_dub\.txt$/, '').replace(/^\d+_\d+\.\s*/, ''), bytes: (await stat(path)).size, pre: (await getCachedPrecondense(COURSES_PATH, p.trim())) || p });
  }
  console.log(`[v2] ${MODULE}\n[v2] nicho: ${PRESET ? PRESET.label : 'nenhum'} | ${lessons.length} aulas`);

  // ETAPA A — Qwen extrai o fingerprint de cada aula (local, gratis)
  console.log('\n[v2] subindo Qwen p/ extrair fingerprints...');
  let up = false; try { up = await startQwen({ log: (m) => console.log(m) }); } catch (e) { console.warn(`[v2] Qwen fora (${e.message}) — segue sem fingerprints`); }
  for (const l of lessons) {
    l.fp = up ? await qwenExtract(l.pre) : '';
    process.stdout.write('.');
  }
  console.log('');
  if (up || await isQwenUp()) { console.log('[v2] derrubando Qwen...'); try { await stopQwen({ log: () => {} }); } catch {} }
  await writeFile(join(OUT, '_fingerprints.txt'), lessons.map((l) => `### ${l.title}\n${l.fp}`).join('\n\n'), 'utf8');

  let cost = 0;
  // ETAPA A.5 — NORMALIZACAO: Qwen PROPOE, DeepSeek VETA, aplicamos deterministico.
  const candidates = collectNorm(lessons.map((l) => l.fp));
  let normMap = [];
  if (candidates.length) {
    const vet = await vetNormMap(candidates, MODULE); cost += vet.cost; normMap = vet.keep;
    console.log(`\n[v2] normalização — candidatos (Qwen): ${candidates.map((m) => `${m.from}→${m.to}`).join(', ')}`);
    console.log(`[v2] normalização — VETADOS p/ aplicar (DeepSeek): ${normMap.map((m) => `${m.from}→${m.to}`).join(', ') || '(nenhum)'}`);
    for (const l of lessons) { l.pre = applyNorm(l.pre, normMap); l.fp = applyNorm(l.fp, normMap); l.title = applyNorm(l.title, normMap); }
  } else {
    console.log('\n[v2] normalização: Qwen não propôs correções.');
  }
  await writeFile(join(OUT, '_normmap.txt'), `CANDIDATOS (Qwen):\n${candidates.map((m) => `${m.from} -> ${m.to}`).join('\n') || '(nenhum)'}\n\nVETADOS/aplicados:\n${normMap.map((m) => `${m.from} -> ${m.to}`).join('\n') || '(nenhum)'}`, 'utf8');
  // ETAPA B — DeepSeek sintetiza o CONTRATO
  console.log('\n[v2] sintetizando o CONTRATO DE CURSO (DeepSeek)...');
  const contract = up ? await buildContract(lessons.map((l) => `${l.title}\n${l.fp}`), INSTRUCTION) : { text: '', cost: 0 };
  cost += contract.cost;
  await writeFile(join(OUT, '_contrato.md'), contract.text || '(sem contrato — Qwen estava fora)', 'utf8');
  console.log('----- CONTRATO -----\n' + contract.text + '\n--------------------');

  // ETAPA C — Planejador ENRIQUECIDO (titulo + fingerprint resumido)
  const enriched = lessons.map(({ id, title, bytes, fp }) => ({
    id, bytes,
    title: fp ? `${title} — [${fp.replace(/\n/g, '; ').slice(0, 240)}]` : title,
  }));
  const planRes = await chatCompletion({
    system: READING_PLAN_SYSTEM, user: buildReadingPlanPrompt({ moduleTitle: MODULE, lessons: enriched }),
    model: DEFAULT_MODEL, temperature: 0.2, maxTokens: Math.min(24000, 8000 + lessons.length * 400), responseFormat: { type: 'json_object' },
  });
  cost += costFromUsage(planRes.usage, DEFAULT_MODEL);
  const groups = (JSON.parse(planRes.content).lessons || [])
    .map((l) => ({ title: (l.title || '').trim(), sources: (l.sources || []).map(Number).filter((n) => n >= 0 && n < lessons.length) })).filter((g) => g.sources.length);
  console.log(`\n[v2] plano (enriquecido): ${groups.length} aulas`);
  groups.forEach((g, i) => console.log(`   ${i + 1}. "${g.title}" <- [${g.sources.join(', ')}]`));

  // ETAPA D — condensa com CONTRATO + clareza + nicho
  const contractHeader = contract.text
    ? `CONTRATO DO CURSO (PRIORIDADE MÁXIMA — TODAS as aulas seguem isto para o projeto ficar coerente; se a modernização oferecer mais de uma abordagem, o contrato decide qual usar em TODO o curso):\n"""\n${contract.text}\n"""\n\n`
    : '';
  console.log('\n[v2] condensando com contrato + clareza + nicho...\n');
  const texts = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const merged = g.sources.map((id) => lessons[id].pre).join('\n\n');
    const user = contractHeader + buildClarityPrompt({ lessonTitle: g.title, transcript: merged, instruction: INSTRUCTION, sourceLanguage: 'pt' });
    process.stdout.write(`[v2] ${String(i + 1).padStart(2, '0')} "${g.title}"... `);
    const { content, usage, model } = await chatCompletion({ system: READING_CONDENSE_SYSTEM, user, model: DEFAULT_MODEL, temperature: 0.3, maxTokens: 14000 });
    cost += costFromUsage(usage, model);
    console.log('ok');
    await writeFile(join(OUT, `${String(i + 1).padStart(2, '0')} ${slug(g.title)}.md`), content.trim(), 'utf8');
    texts.push(content);
  }

  // ETAPA E — checagem de consistencia (generica) + auth so se for modulo de auth
  console.log('\n===== CONSISTÊNCIA (camada 1, para sua conferência) =====');
  const per = texts.map(extractArtifacts);
  const endpoints = [...new Set(per.flatMap((a) => [...a.endpoints]))];
  if (endpoints.length) console.log(`endpoints no módulo: ${endpoints.join(', ')}`);
  const { clusters } = stringClusterClasses(per.map((a) => a.classes));
  const drift = clusters.filter((c) => new Set(c.map((n) => n.toLowerCase().replace(/(impl|interface)$/, ''))).size > 1);
  console.log(drift.length ? 'nomes divergentes p/ mesmo papel (confira lendo):' : 'camada 1 não achou nomes divergentes óbvios entre as aulas.');
  drift.forEach((c) => console.log(`   - ${c.join('  /  ')}`));
  // Teste de arquitetura de auth: so quando o modulo é de auth/seguranca.
  if (texts.some((t) => /\b(jwt|oauth|spring security|token|autentica)/i.test(t))) {
    const buildsRS = (t) => /\.?oauth2ResourceServer\s*\(|NimbusJwtDecoder|\.jwt\s*\(\s*jwt\s*->/i.test(t);
    const buildsManual = (t) => /addFilterBefore\s*\(|extends\s+OncePerRequestFilter|class\s+\w*AuthenticationFilter\s+extends/i.test(t);
    const rs = texts.map((t, i) => buildsRS(t) ? i + 1 : null).filter(Boolean);
    const mf = texts.map((t, i) => buildsManual(t) ? i + 1 : null).filter(Boolean);
    console.log(`[auth] constroem Resource Server: [${rs.join(', ') || '-'}] | constroem filtro manual: [${mf.join(', ') || '-'}]`);
    console.log(rs.length && mf.length ? '>> CONTRADIÇÃO de arquitetura' : '>> arquitetura de auth consistente ✓');
  }

  console.log(`\n[v2] pronto -> ${OUT}`);
  console.log(`[v2] custo DeepSeek total: $${cost.toFixed(4)} (Qwen local = grátis; producao intocada)`);
};

run().catch((e) => { console.error('[v2] ERRO:', e.message); process.exit(1); });
