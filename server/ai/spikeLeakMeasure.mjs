// MEDICAO DE VAZAMENTO (spike) — input FIXO (grupo JWT merjado, pre-condensado),
// roda A (original) e B (melhorado) N vezes e conta "substantivos tecnicos"
// (anotacoes @X + identificadores CamelCase) que NAO aparecem na fonte.
// Como A e B rodam sobre o MESMO input e o MESMO detector, a comparacao e justa
// mesmo com a variancia da temperatura. NAO altera producao.
//
// Uso: node server/ai/spikeLeakMeasure.mjs --runs 3

import '../load-env.js';
import { join } from 'path';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { READING_CONDENSE_SYSTEM, buildReadingCondensePrompt } from './prompts.js';
import { parseTranscript } from './generator.js';
import { getCachedPrecondense } from './precondenseStore.js';

const COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';
const MOD = join(COURSES_PATH, 'Spring Rest-Construindo Web Services Poderosos', '04. Avançando com a API - Spring Security e JWT');
const FILES = [
  '06_06. Porque autenticar via tokens', '07_07. Torando a autenticação stateless',
  '08_08. Autenticando via AuthenticationController', '09_09. Gerando JWT',
  '10_10. Padronizando response com TokenDTO',
];
const TITLE = 'Autenticação Stateless com JWT';
const RUNS = Math.max(1, parseInt((process.argv[process.argv.indexOf('--runs') + 1]) || '3', 10));

const ORIGINAL_LINE =
  '- Your job is to EXPLAIN BETTER what is in the transcript — NOT to expand the content.';
const MODIFIED_LINE =
  `- Your job is to EXPLAIN BETTER the topics the lesson covered — improve HOW they are
  explained, NOT add new content. Keep FULL FIDELITY: same topics, same scope. Clarity must
  come from REORGANIZING, REWORDING and adding ANALOGIES — NEVER from adding technical facts.
  Operational test: every technical noun you write (class, method, tool, library, standard/RFC,
  protocol, number, config key, term) MUST already appear in the source; if it is not there,
  leave it out — EVEN IF it is true, standard, best practice, or you happen to know it. If the
  instructor was confusing, rushed, out of order, or mixed up two ideas, untangle THAT SAME
  material: state the lesson's OWN "why" before its "how", separate the ideas, reorder — do not
  supply a rationale or detail the lesson did not give. When several sources are merged below,
  they are the COMPLETE material: connect them with transitions, not with outside facts.`;

// Candidatos a "substantivo tecnico": anotacoes @X e identificadores CamelCase.
const candidates = (txt) => {
  const set = new Set();
  for (const m of txt.matchAll(/@[A-Z][A-Za-z0-9]+/g)) set.add(m[0]);
  for (const m of txt.matchAll(/\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/g)) set.add(m[0]);
  return set;
};
const leaks = (out, srcLower) => [...candidates(out)].filter((t) => !srcLower.includes(t.toLowerCase()));

const gen = async (user) => {
  const { content, usage, model } = await chatCompletion({ system: READING_CONDENSE_SYSTEM, user, model: DEFAULT_MODEL, temperature: 0.3, maxTokens: 14000 });
  return { content, cost: costFromUsage(usage, model) };
};

const run = async () => {
  const parts = [];
  for (const f of FILES) {
    const p = await parseTranscript(join(MOD, f + '_dub.txt'));
    parts.push(await getCachedPrecondense(COURSES_PATH, p.trim()) || p);
  }
  const merged = parts.join('\n\n');
  const srcLower = merged.toLowerCase();
  const promptA = buildReadingCondensePrompt({ lessonTitle: TITLE, transcript: merged, instruction: '', sourceLanguage: 'pt' });
  const promptB = promptA.replace(ORIGINAL_LINE, MODIFIED_LINE);
  if (promptB === promptA) throw new Error('linha original nao encontrada');

  console.log(`[leak] grupo "${TITLE}" (${FILES.length} aulas, ${merged.length} chars) | ${RUNS} rodadas\n`);
  let aTot = 0, bTot = 0, cost = 0; const rows = [];
  for (let r = 1; r <= RUNS; r++) {
    const a = await gen(promptA); const b = await gen(promptB);
    const al = leaks(a.content, srcLower), bl = leaks(b.content, srcLower);
    aTot += al.length; bTot += bl.length; cost += a.cost + b.cost;
    rows.push({ r, a: al.length, b: bl.length, aEx: al.slice(0, 8), bEx: bl.slice(0, 8) });
    console.log(`run ${r}: A=${al.length} leaks  B=${bl.length} leaks`);
    console.log(`   A ex: ${al.slice(0, 10).join(', ') || '(nenhum)'}`);
    console.log(`   B ex: ${bl.slice(0, 10).join(', ') || '(nenhum)'}`);
  }
  console.log(`\n[leak] MEDIA por rodada -> A(original)=${(aTot / RUNS).toFixed(1)}  B(melhorado)=${(bTot / RUNS).toFixed(1)}`);
  console.log(`[leak] custo: $${cost.toFixed(4)}  | detector: anotacoes @X + CamelCase ausentes da fonte`);
};

run().catch((e) => { console.error('[leak] ERRO:', e.message); process.exit(1); });
