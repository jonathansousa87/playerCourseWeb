// MEDICAO DE FIDELIDADE (spike) — metrica semantica estilo FActScore/SummaC.
// Um "fact-checker" (LLM-as-judge, temp 0) decompoe as AFIRMACOES TECNICAS do
// texto gerado e rotula cada uma vs a FONTE: SUPPORTED / UNSUPPORTED / CONTRADICTED.
//   faithfulness = suportadas / total ;  vazamento = nao-suportadas.
// Roda A (prompt original) e B (melhorado) N vezes sobre o MESMO input merjado.
// NAO altera producao. Custo so no spike.
//
// Uso: node server/ai/spikeFaithfulness.mjs --runs 3

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

const JUDGE_SYSTEM =
  'You are a STRICT fact-checker measuring the FAITHFULNESS of a study text against its SOURCE. ' +
  'Work only from the SOURCE; use no outside knowledge. A claim is SUPPORTED only if the SOURCE ' +
  'states it or directly implies it (a reader with the SOURCE alone could arrive at it). ' +
  'UNSUPPORTED = a concrete technical fact the SOURCE never gives (a tool/library/standard/RFC/number/' +
  'config/API-behavior not present), even if it is objectively true or best practice. ' +
  'CONTRADICTED = conflicts with the SOURCE. Judge ONLY concrete technical/factual claims; IGNORE ' +
  'analogies, motivation, opinions, structure and formatting. Reply ONLY with pure JSON.';

const buildJudgePrompt = (source, summary) => `
SOURCE (the only ground truth):
"""
${source}
"""

STUDY TEXT to fact-check:
"""
${summary}
"""

List the concrete technical claims of the STUDY TEXT and label each. Return pure JSON:
{
  "total": <number of technical claims judged>,
  "supported": <count SUPPORTED>,
  "unsupported": ["short claim not backed by the SOURCE", ...],
  "contradicted": ["short claim conflicting with the SOURCE", ...]
}
Be strict but fair: standard code that is the obvious realization of what the SOURCE describes in
prose counts as SUPPORTED; a NEW named tool/standard/number the SOURCE never mentions is UNSUPPORTED.`.trim();

const gen = async (user) => {
  const { content, usage, model } = await chatCompletion({ system: READING_CONDENSE_SYSTEM, user, model: DEFAULT_MODEL, temperature: 0.3, maxTokens: 14000 });
  return { content, cost: costFromUsage(usage, model) };
};

const judge = async (source, summary) => {
  const { content, usage, model } = await chatCompletion({
    system: JUDGE_SYSTEM, user: buildJudgePrompt(source, summary), model: DEFAULT_MODEL,
    temperature: 0, maxTokens: 4000, responseFormat: { type: 'json_object' },
    thinking: { type: 'disabled' }, // tarefa deterministica; evita reasoning comer o budget
  });
  const j = JSON.parse(content);
  const unsupported = (j.unsupported || []).length;
  const contradicted = (j.contradicted || []).length;
  const total = j.total || (j.supported || 0) + unsupported + contradicted;
  const faith = total ? (j.supported || (total - unsupported - contradicted)) / total : 1;
  return { total, unsupported, contradicted, faith, exUnsup: (j.unsupported || []).slice(0, 6), cost: costFromUsage(usage, model) };
};

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

const run = async () => {
  const parts = [];
  for (const f of FILES) {
    const p = await parseTranscript(join(MOD, f + '_dub.txt'));
    parts.push(await getCachedPrecondense(COURSES_PATH, p.trim()) || p);
  }
  const source = parts.join('\n\n');
  const promptA = buildReadingCondensePrompt({ lessonTitle: TITLE, transcript: source, instruction: '', sourceLanguage: 'pt' });
  const promptB = promptA.replace(ORIGINAL_LINE, MODIFIED_LINE);
  if (promptB === promptA) throw new Error('linha original nao encontrada');

  console.log(`[faith] grupo "${TITLE}" (${FILES.length} aulas, ${source.length} chars) | ${RUNS} rodadas`);
  console.log('[faith] metrica: fact-check LLM (temp 0) — faithfulness=suportadas/total, vazamento=nao-suportadas\n');

  const A = { faith: [], unsup: [] }, B = { faith: [], unsup: [] };
  let cost = 0;
  for (let r = 1; r <= RUNS; r++) {
    const ga = await gen(promptA), gb = await gen(promptB);
    const ja = await judge(source, ga.content), jb = await judge(source, gb.content);
    cost += ga.cost + gb.cost + ja.cost + jb.cost;
    A.faith.push(ja.faith); A.unsup.push(ja.unsupported);
    B.faith.push(jb.faith); B.unsup.push(jb.unsupported);
    console.log(`run ${r}:`);
    console.log(`  A(original)  fidelidade=${(ja.faith * 100).toFixed(0)}%  nao-suportadas=${ja.unsupported}/${ja.total}${ja.contradicted ? ` (contraditas ${ja.contradicted})` : ''}`);
    console.log(`     ex: ${ja.exUnsup.join(' | ') || '(nenhuma)'}`);
    console.log(`  B(melhorado) fidelidade=${(jb.faith * 100).toFixed(0)}%  nao-suportadas=${jb.unsupported}/${jb.total}${jb.contradicted ? ` (contraditas ${jb.contradicted})` : ''}`);
    console.log(`     ex: ${jb.exUnsup.join(' | ') || '(nenhuma)'}`);
  }
  console.log(`\n[faith] MEDIA -> A: fidelidade ${(avg(A.faith) * 100).toFixed(0)}%, ${avg(A.unsup).toFixed(1)} nao-suportadas/aula`);
  console.log(`[faith]          B: fidelidade ${(avg(B.faith) * 100).toFixed(0)}%, ${avg(B.unsup).toFixed(1)} nao-suportadas/aula`);
  console.log(`[faith] custo total: $${cost.toFixed(4)} (spike; producao intocada)`);
};

run().catch((e) => { console.error('[faith] ERRO:', e.message); process.exit(1); });
