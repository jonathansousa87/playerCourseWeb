// SPIKE — CONTRATO DE NOMENCLATURA (etapa 1: provar o mecanismo)
// Extrai um glossario canonico do modulo (nomes como aparecem na FONTE), depois
// condensa CADA aula agrupada em 2 condicoes:
//   BASELINE = prompt atual de producao (sem glossario)
//   CONTRATO = mesmo prompt + bloco de glossario injetado
// e mede o DRIFT de nomes entre as aulas em cada condicao. NAO altera producao.
// Glossario gerado por DeepSeek aqui (confiavel) — na producao seria o Qwen local.
//
// Uso: node server/ai/spikeGlossaryContract.mjs

import '../load-env.js';
import { writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { READING_CONDENSE_SYSTEM, buildReadingCondensePrompt, READING_PLAN_SYSTEM, buildReadingPlanPrompt } from './prompts.js';
import { parseTranscript } from './generator.js';
import { getCachedPrecondense } from './precondenseStore.js';
import { extractArtifacts, driftReport } from './readingConsistency.mjs';

const COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';
const MODULE = join(COURSES_PATH, 'Spring Rest-Construindo Web Services Poderosos', '04. Avançando com a API - Spring Security e JWT');
const OUT = resolve('docs/spike-out');

const loadModule = async () => {
  const files = (await readdir(MODULE)).filter((f) => /_dub\.txt$/.test(f)).sort();
  const lessons = [];
  for (let id = 0; id < files.length; id++) {
    const path = join(MODULE, files[id]);
    const p = await parseTranscript(path);
    lessons.push({
      id,
      title: files[id].replace(/_dub\.txt$/, '').replace(/^\d+_\d+\.\s*/, ''),
      bytes: (await stat(path)).size,
      pre: (await getCachedPrecondense(COURSES_PATH, p.trim())) || p,
    });
  }
  return lessons;
};

const GLOSSARY_SYSTEM =
  'You extract a NAMING GLOSSARY from a course module\'s transcripts. Identify the RECURRING artifacts ' +
  'the module builds across lessons (main classes/interfaces, the authentication endpoint path, the domain ' +
  'entity, the key library, the base package) and give the CANONICAL name EXACTLY as it appears in the ' +
  'source. Only artifacts that recur across lessons. Reply with pure JSON.';

const buildGlossary = async (lessons) => {
  const corpus = lessons.map((l) => `--- ${l.title} ---\n${l.pre}`).join('\n\n').slice(0, 60000);
  const { content, usage, model } = await chatCompletion({
    system: GLOSSARY_SYSTEM,
    user: `Module transcripts (pre-condensed):\n"""\n${corpus}\n"""\n\nReturn pure JSON:\n{ "artifacts": [ { "concept": "short role (e.g. token service, auth endpoint, security config class, user entity)", "name": "canonical name exactly as in the source" } ] }\nInclude only artifacts that appear in MORE THAN ONE lesson.`,
    model: DEFAULT_MODEL, temperature: 0.2, maxTokens: 2000,
    responseFormat: { type: 'json_object' }, thinking: { type: 'disabled' },
  });
  return { artifacts: (JSON.parse(content).artifacts || []), cost: costFromUsage(usage, model) };
};

const glossaryBlock = (artifacts) =>
  `GLOSSARIO CANONICO DO CURSO (use EXATAMENTE estes nomes; NUNCA invente variantes nem renomeie).\n` +
  `Se um destes conceitos aparecer nesta aula, refira-se a ele com o nome exato abaixo:\n` +
  artifacts.map((a) => `- ${a.concept}: ${a.name}`).join('\n') +
  `\nNao troque estes nomes por sinonimos "mais modernos" — a consistencia entre as aulas depende disso.\n\n`;

const plan = async (lessons) => {
  const { content, usage, model } = await chatCompletion({
    system: READING_PLAN_SYSTEM,
    user: buildReadingPlanPrompt({ moduleTitle: 'Spring Security e JWT', lessons: lessons.map(({ id, title, bytes }) => ({ id, title, bytes })) }),
    model: DEFAULT_MODEL, temperature: 0.2, maxTokens: Math.min(24000, 8000 + lessons.length * 400),
    responseFormat: { type: 'json_object' },
  });
  const groups = (JSON.parse(content).lessons || [])
    .map((l) => ({ title: (l.title || '').trim(), sources: (l.sources || []).map(Number).filter((n) => n >= 0 && n < lessons.length) }))
    .filter((g) => g.sources.length);
  return { groups, cost: costFromUsage(usage, model) };
};

const condense = async (title, merged, gloss) => {
  let user = buildReadingCondensePrompt({ lessonTitle: title, transcript: merged, instruction: '', sourceLanguage: 'pt' });
  if (gloss) user = glossaryBlock(gloss) + user; // injeta o contrato no topo
  const { content, usage, model } = await chatCompletion({ system: READING_CONDENSE_SYSTEM, user, model: DEFAULT_MODEL, temperature: 0.3, maxTokens: 14000 });
  return { content, cost: costFromUsage(usage, model) };
};

// Detector ENDURECIDO (camada 1 string + camada 2 semantica no Qwen local).
const scanAndPrint = async (label, texts) => {
  const perLesson = texts.map(extractArtifacts);
  const r = await driftReport(perLesson, { useSemantic: true });
  console.log(`  ${label}:`);
  console.log(`    endpoints vistos: ${r.endpoints.join(', ') || '-'}`);
  console.log(`    camada 2 (Qwen): ${r.semantic.ok ? 'ativa' : `INDISPONIVEL (${r.semantic.error}) — so camada 1`}`);
  if (r.driftGroups.length) r.driftGroups.forEach((g) => console.log(`    DRIFT: {${g.join(' == ')}}`));
  else console.log('    sem drift detectado');
  console.log(`    >> grupos com drift: ${r.driftCount}`);
  return r.driftCount;
};

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const lessons = await loadModule();
  console.log(`[glossario] modulo 04: ${lessons.length} aulas pre-condensadas\n`);

  const g = await buildGlossary(lessons);
  console.log('[glossario] GLOSSARIO extraido da fonte:');
  g.artifacts.forEach((a) => console.log(`   - ${a.concept}: ${a.name}`));
  console.log('');

  const p = await plan(lessons);
  console.log(`[glossario] plano: ${p.groups.length} aulas de leitura\n`);

  const baseTexts = [], contractTexts = [];
  let cost = g.cost + p.cost;
  for (const grp of p.groups) {
    const merged = grp.sources.map((i) => lessons[i].pre).join('\n\n');
    process.stdout.write(`[glossario] "${grp.title}": baseline... `);
    const b = await condense(grp.title, merged, null);
    process.stdout.write(`contrato... `);
    const c = await condense(grp.title, merged, g.artifacts);
    console.log('ok');
    cost += b.cost + c.cost;
    baseTexts.push(b.content); contractTexts.push(c.content);
    const s = grp.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await writeFile(join(OUT, `${s}__BASELINE.md`), b.content, 'utf8');
    await writeFile(join(OUT, `${s}__CONTRATO.md`), c.content, 'utf8');
  }

  console.log('\n===== DRIFT DE NOMES ENTRE AS AULAS (detector endurecido) =====');
  const dBase = await scanAndPrint('BASELINE (sem glossario)', baseTexts);
  const dContract = await scanAndPrint('CONTRATO (com glossario)', contractTexts);
  console.log(`\n[glossario] RESULTADO -> drift baseline=${dBase}  drift com contrato=${dContract}`);
  console.log(`[glossario] custo total: $${cost.toFixed(4)} (spike; producao intocada)`);
};

run().catch((e) => { console.error('[glossario] ERRO:', e.message); process.exit(1); });
