// SPIKE AGRUPADO — valida a condensacao REAL do DeepSeek: varias aulas
// pre-condensadas (Qwen) sao AGRUPADAS pelo plano (Fase 1) e o merge delas vira
// UMA aula de leitura (Fase 2). Testa A (prompt original) vs B (alterado) nessa
// condensacao agrupada — que e como o curso de leitura e gerado de fato.
// NAO altera producao: a versao B (troca de 1 linha) vive so aqui.
//
// Uso: node server/ai/spikeReadingGrouped.mjs
//   flags: --module "<nome do modulo>"  --groups 2  (quantos grupos multi-aula condensar)

import '../load-env.js';
import { writeFile, mkdir, stat } from 'fs/promises';
import { readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import {
  READING_CONDENSE_SYSTEM, buildReadingCondensePrompt,
  READING_PLAN_SYSTEM, buildReadingPlanPrompt,
} from './prompts.js';
import { parseTranscript } from './generator.js';
import { getCachedPrecondense } from './precondenseStore.js';

const COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';
const COURSE_ROOT = join(COURSES_PATH, 'Spring Rest-Construindo Web Services Poderosos');
const OUT = resolve('docs/spike-out');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MODULE = arg('module', '04. Avançando com a API - Spring Security e JWT');
const MAX_GROUPS = Math.max(1, parseInt(arg('groups', '2'), 10));

// A UNICA diferenca entre A e B: a 1a linha da FIDELITY RULE.
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

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Condensa como producao: temperatura 0.3, maxTokens 14000.
const condense = async (user) => {
  const { content, usage, model } = await chatCompletion({
    system: READING_CONDENSE_SYSTEM, user, model: DEFAULT_MODEL, temperature: 0.3, maxTokens: 14000,
  });
  return { content: content.trim(), cost: costFromUsage(usage, model), tokens: usage?.completion_tokens ?? 0 };
};

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const dir = join(COURSE_ROOT, MODULE);
  const files = (await readdir(dir)).filter((f) => /_dub\.txt$/.test(f)).sort();

  // Monta as aulas (id, titulo, bytes) como a Fase 1 espera.
  const lessons = [];
  for (let id = 0; id < files.length; id++) {
    const path = join(dir, files[id]);
    const title = files[id].replace(/_dub\.txt$/, '').replace(/^\d+_\d+\.\s*/, '');
    const bytes = (await stat(path)).size;
    lessons.push({ id, title, bytes, path });
  }
  console.log(`[grouped] modulo: ${MODULE}`);
  console.log(`[grouped] ${lessons.length} aulas -> rodando o PLANEJADOR real (Fase 1)...`);

  // FASE 1: plano real (agrupamento).
  const planPrompt = buildReadingPlanPrompt({ moduleTitle: MODULE, lessons: lessons.map(({ id, title, bytes }) => ({ id, title, bytes })) });
  const maxTok = Math.min(24000, 8000 + lessons.length * 400);
  const planRes = await chatCompletion({
    system: READING_PLAN_SYSTEM, user: planPrompt, model: DEFAULT_MODEL,
    temperature: 0.2, maxTokens: maxTok, responseFormat: { type: 'json_object' },
  });
  let planCost = costFromUsage(planRes.usage, DEFAULT_MODEL);
  const parsed = JSON.parse(planRes.content);
  const groups = (parsed.lessons || [])
    .map((l) => ({ title: (l.title || '').trim(), sources: (l.sources || []).map(Number).filter((n) => n >= 0 && n < lessons.length) }))
    .filter((g) => g.sources.length);

  console.log(`[grouped] plano: ${groups.length} aulas de leitura`);
  groups.forEach((g) => console.log(`   - "${g.title}"  <- aulas [${g.sources.join(', ')}] (${g.sources.map((i) => lessons[i].title).join(' | ')})`));

  // Escolhe os grupos com MAIS aulas (o caso agrupado que importa validar).
  const multi = groups.filter((g) => g.sources.length >= 2).sort((a, b) => b.sources.length - a.sources.length).slice(0, MAX_GROUPS);
  if (!multi.length) { console.log('[grouped] nenhum grupo multi-aula no plano; nada a testar.'); return; }
  console.log(`\n[grouped] condensando ${multi.length} grupo(s) multi-aula (A original vs B alterado)...\n`);

  let totalCost = planCost;
  const summary = [];
  for (const g of multi) {
    // Merge dos PRE-CONDENSADOS (input real do DeepSeek), como condenseLesson.
    const parts = [];
    let precond = 0;
    for (const id of g.sources) {
      const p = await parseTranscript(lessons[id].path);
      const cached = await getCachedPrecondense(COURSES_PATH, p.trim());
      if (cached != null) { parts.push(cached); precond++; } else parts.push(p);
    }
    const merged = parts.filter(Boolean).join('\n\n');
    const promptA = buildReadingCondensePrompt({ lessonTitle: g.title, transcript: merged, instruction: '', sourceLanguage: 'pt' });
    const promptB = promptA.replace(ORIGINAL_LINE, MODIFIED_LINE);
    if (promptB === promptA) throw new Error('linha original nao encontrada — prompt de producao mudou');

    process.stdout.write(`[grouped] "${g.title}" (${g.sources.length} aulas, ${precond} pre-cond, ${merged.length} chars): A... `);
    const a = await condense(promptA);
    process.stdout.write(`B... `);
    const b = await condense(promptB);
    console.log(`ok (A ${a.tokens}tok $${a.cost.toFixed(4)} / B ${b.tokens}tok $${b.cost.toFixed(4)})`);
    totalCost += a.cost + b.cost;

    const s = slug(g.title);
    await writeFile(join(OUT, `${s}__A_original.md`), a.content, 'utf8');
    await writeFile(join(OUT, `${s}__B_alterado.md`), b.content, 'utf8');
    const key = shuffle([{ real: 'A_original', ...a }, { real: 'B_alterado', ...b }]).map((x, i) => ({ ...x, label: `v${i + 1}` }));
    const blind = key.map((x) => `## Versao ${x.label}\n\n${x.content}\n`).join('\n---\n\n');
    await writeFile(join(OUT, `${s}__COMPARE_BLIND.md`), `# ${g.title}\n\n> Aulas de origem: ${g.sources.map((i) => lessons[i].title).join(' + ')}\n> Pontue as duas versoes ANTES do gabarito.\n\n${blind}`, 'utf8');
    await writeFile(join(OUT, `${s}__gabarito.txt`), key.map((x) => `${x.label} = ${x.real}`).join('\n') + '\n', 'utf8');
    summary.push({ title: g.title, n: g.sources.length, chars: merged.length, aTok: a.tokens, bTok: b.tokens });
  }

  console.log(`\n[grouped] pronto -> ${OUT}`);
  console.log(`[grouped] custo total (plano + condensacoes): $${totalCost.toFixed(4)}`);
  console.log('[grouped] producao NAO alterada. Abra os *__COMPARE_BLIND.md.');
};

run().catch((e) => { console.error('[grouped] ERRO:', e.message); process.exit(1); });
