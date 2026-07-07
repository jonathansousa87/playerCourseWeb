// SPIKE — MODULO INTEIRO com a regra de CLAREZA. Roda o planejador real (Fase 1)
// no modulo 04, condensa CADA aula de leitura agrupada com o prompt de clareza,
// e faz uma varredura leve de consistencia (camada 1, deterministica) pra ver se
// as aulas se conectam. NAO altera producao.
//
// Uso: node server/ai/spikeReadingModuleClarity.mjs [--module "<nome>"]

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

const COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';
const COURSE = 'Spring Rest-Construindo Web Services Poderosos';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MODULE = arg('module', '04. Avançando com a API - Spring Security e JWT');
// Instrucao de nicho REAL da plataforma (preset). '--nicho none' desliga.
const NICHO = arg('nicho', 'java');
const PRESET = NICHO === 'none' ? null : INSTRUCTION_PRESETS.find((p) => p.key === NICHO);
const INSTRUCTION = PRESET ? PRESET.text : '';
const OUT = resolve('docs/spike-out/modulo04-clareza');

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const dir = join(COURSES_PATH, COURSE, MODULE);
  const files = (await readdir(dir)).filter((f) => /_dub\.txt$/.test(f)).sort();

  const lessons = [];
  for (let id = 0; id < files.length; id++) {
    const path = join(dir, files[id]);
    const p = await parseTranscript(path);
    lessons.push({
      id, path,
      title: files[id].replace(/_dub\.txt$/, '').replace(/^\d+_\d+\.\s*/, ''),
      bytes: (await stat(path)).size,
      pre: (await getCachedPrecondense(COURSES_PATH, p.trim())) || p,
    });
  }
  console.log(`[modulo] ${MODULE}`);
  console.log(`[modulo] nicho: ${PRESET ? PRESET.label : 'NENHUM'} (${INSTRUCTION.length} chars de instrução)`);
  console.log(`[modulo] ${lessons.length} aulas -> planejador real (Fase 1)...`);

  const planRes = await chatCompletion({
    system: READING_PLAN_SYSTEM,
    user: buildReadingPlanPrompt({ moduleTitle: MODULE, lessons: lessons.map(({ id, title, bytes }) => ({ id, title, bytes })) }),
    model: DEFAULT_MODEL, temperature: 0.2, maxTokens: Math.min(24000, 8000 + lessons.length * 400),
    responseFormat: { type: 'json_object' },
  });
  let cost = costFromUsage(planRes.usage, DEFAULT_MODEL);
  const groups = (JSON.parse(planRes.content).lessons || [])
    .map((l) => ({ title: (l.title || '').trim(), sources: (l.sources || []).map(Number).filter((n) => n >= 0 && n < lessons.length) }))
    .filter((g) => g.sources.length);

  console.log(`[modulo] plano: ${groups.length} aulas de leitura`);
  groups.forEach((g, i) => console.log(`   ${i + 1}. "${g.title}" <- [${g.sources.join(', ')}]`));
  console.log('\n[modulo] condensando cada aula com a regra de CLAREZA...\n');

  const texts = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const merged = g.sources.map((id) => lessons[id].pre).join('\n\n');
    const user = buildClarityPrompt({ lessonTitle: g.title, transcript: merged, instruction: INSTRUCTION, sourceLanguage: 'pt' });
    process.stdout.write(`[modulo] ${String(i + 1).padStart(2, '0')} "${g.title}" (${g.sources.length} aulas)... `);
    const { content, usage, model } = await chatCompletion({ system: READING_CONDENSE_SYSTEM, user, model: DEFAULT_MODEL, temperature: 0.3, maxTokens: 14000 });
    cost += costFromUsage(usage, model);
    console.log(`ok ($${costFromUsage(usage, model).toFixed(4)}, ${usage?.completion_tokens ?? '?'} tok)`);
    const file = `${String(i + 1).padStart(2, '0')} ${slug(g.title)}.md`;
    await writeFile(join(OUT, file), content.trim(), 'utf8');
    texts.push(content);
  }

  // Varredura leve de consistencia (camada 1, deterministica): nomes de classe
  // string-proximos que aparecem em aulas diferentes = suspeita de drift.
  console.log('\n===== CONSISTÊNCIA ENTRE AS AULAS (camada 1, para sua conferência) =====');
  const per = texts.map(extractArtifacts);
  const { clusters } = stringClusterClasses(per.map((a) => a.classes));
  const endpoints = [...new Set(per.flatMap((a) => [...a.endpoints]))];
  const suspeitas = clusters.filter((c) => new Set(c.map((n) => n.toLowerCase().replace(/(impl|interface)$/,''))).size > 1);
  console.log(`endpoints vistos no módulo: ${endpoints.join(', ') || '-'}`);
  if (suspeitas.length) {
    console.log('suspeitas de nome divergente para o mesmo papel (confira lendo):');
    suspeitas.forEach((c) => console.log(`   - ${c.join('  /  ')}`));
  } else {
    console.log('camada 1 não achou nomes de classe divergentes óbvios entre as aulas.');
  }

  console.log(`\n[modulo] pronto -> ${OUT}`);
  console.log(`[modulo] leia na ordem 01..${groups.length}. custo total: $${cost.toFixed(4)} (spike; producao intocada)`);
};

run().catch((e) => { console.error('[modulo] ERRO:', e.message); process.exit(1); });
