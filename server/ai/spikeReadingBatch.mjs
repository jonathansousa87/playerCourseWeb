// SPIKE em LOTE — roda o A/B (prompt original vs. alterado) em varias aulas
// PRE-CONDENSADAS de um curso, que e o input REAL do DeepSeek em producao.
// NAO altera producao: a versao alterada vive so aqui (troca de 1 linha).
//
// Uso: node server/ai/spikeReadingBatch.mjs
// (edite COURSE_ROOT / LESSONS para outro curso/aulas)

import '../load-env.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { READING_CONDENSE_SYSTEM, buildReadingCondensePrompt } from './prompts.js';
import { parseTranscript } from './generator.js';
import { getCachedPrecondense } from './precondenseStore.js';

const COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';
const COURSE_ROOT = join(COURSES_PATH, 'Spring Rest-Construindo Web Services Poderosos');
const OUT = resolve('docs/spike-out');

// Aulas CONCEITUAIS (onde "explicar melhor" mais importa), todas com pre-condensado.
const LESSONS = [
  { mod: '05. Avançando com a API - Spring Cache Redis', file: '01_01. O que é cache e para o que ele serve_dub.txt', title: 'O que é cache e para o que serve' },
  { mod: '04. Avançando com a API - Spring Security e JWT', file: '06_06. Porque autenticar via tokens_dub.txt', title: 'Por que autenticar via tokens' },
  { mod: '01. Desvendando REST entendendo arquitetura(...)', file: '08_08. JSON - Nomenclatura e boas práticas_dub.txt', title: 'JSON: Nomenclatura e boas práticas' },
  { mod: '02. Primeiros recursos padronizando ambiente Docker', file: '29_29. HATEOAS_dub.txt', title: 'HATEOAS' },
  { mod: '01. Desvendando REST entendendo arquitetura(...)', file: '04_04. API Monolítica e camadas bem definidas_dub.txt', title: 'API Monolítica e camadas bem definidas' },
];

// A UNICA diferenca entre A (original) e B (alterado): a 1a linha da FIDELITY RULE.
const ORIGINAL_LINE =
  '- Your job is to EXPLAIN BETTER what is in the transcript — NOT to expand the content.';
const MODIFIED_LINE =
  `- Your job is to EXPLAIN BETTER the topics the lesson covered — NOT to expand into new content.
  Keep FULL FIDELITY to WHAT the lesson taught (same topics, same scope, invent nothing), but improve
  HOW it is explained: make it clear and easy to understand. If the instructor was confusing, rushed,
  out of order, or mixed up two ideas, untangle it — state the "why" before the "how", clarify the
  confusing point, and give a cleaner explanation of THAT SAME topic. Deeper clarity of the covered
  topics: yes; new topics/facts the lesson did not teach: no.`;

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const gen = async (user) => {
  const { content, usage, model } = await chatCompletion({ system: READING_CONDENSE_SYSTEM, user, model: DEFAULT_MODEL });
  return { content, cost: costFromUsage(usage, model), tokens: usage?.completion_tokens ?? 0 };
};

const run = async () => {
  await mkdir(OUT, { recursive: true });
  console.log(`[batch] curso: ${COURSE_ROOT}`);
  console.log(`[batch] ${LESSONS.length} aulas conceituais, input = PRE-CONDENSADO (Qwen) do cache\n`);
  let totalCost = 0;
  const summary = [];

  for (const l of LESSONS) {
    const path = join(COURSE_ROOT, l.mod, l.file);
    const parsed = await parseTranscript(path);
    const pre = await getCachedPrecondense(COURSES_PATH, parsed.trim());
    if (pre == null) { console.log(`[batch] PULANDO (sem pre-condensado): ${l.title}`); continue; }

    const promptA = buildReadingCondensePrompt({ lessonTitle: l.title, transcript: pre, instruction: '', sourceLanguage: 'pt' });
    const promptB = promptA.replace(ORIGINAL_LINE, MODIFIED_LINE);
    if (promptB === promptA) throw new Error('linha original nao encontrada — prompt de producao mudou');

    process.stdout.write(`[batch] ${l.title}: A... `);
    const a = await gen(promptA);
    process.stdout.write(`B... `);
    const b = await gen(promptB);
    console.log(`ok (A $${a.cost.toFixed(4)} / B $${b.cost.toFixed(4)})`);
    totalCost += a.cost + b.cost;

    const s = slug(l.title);
    await writeFile(join(OUT, `${s}__A_original.md`), a.content, 'utf8');
    await writeFile(join(OUT, `${s}__B_alterado.md`), b.content, 'utf8');
    const key = shuffle([{ real: 'A_original', ...a }, { real: 'B_alterado', ...b }]).map((x, i) => ({ ...x, label: `v${i + 1}` }));
    const blind = key.map((x) => `## Versao ${x.label}\n\n${x.content}\n`).join('\n---\n\n');
    await writeFile(join(OUT, `${s}__COMPARE_BLIND.md`), `# ${l.title}\n\n> Pontue as duas versoes ANTES do gabarito.\n\n${blind}`, 'utf8');
    await writeFile(join(OUT, `${s}__gabarito.txt`), key.map((x) => `${x.label} = ${x.real}`).join('\n') + '\n', 'utf8');
    summary.push({ title: l.title, aTok: a.tokens, bTok: b.tokens });
  }

  const table = ['# Spike em lote — aulas pre-condensadas', '', '| Aula | tokens A (original) | tokens B (alterado) |', '|---|---|---|',
    ...summary.map((s) => `| ${s.title} | ${s.aTok} | ${s.bTok} |`), '', `Custo total: $${totalCost.toFixed(4)}`, '',
    'Producao (server/ai/prompts.js) NAO foi alterada. Abra os *__COMPARE_BLIND.md, pontue, confira *__gabarito.txt.'].join('\n');
  await writeFile(join(OUT, '_SUMARIO.md'), table, 'utf8');
  console.log(`\n[batch] pronto -> ${OUT}`);
  console.log(`[batch] custo total: $${totalCost.toFixed(4)}`);
};

run().catch((e) => { console.error('[batch] ERRO:', e.message); process.exit(1); });
