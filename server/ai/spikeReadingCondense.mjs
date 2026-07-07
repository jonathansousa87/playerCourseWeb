// SPIKE — "explicar melhor mantendo fidelidade" (NAO altera producao)
// Gera a MESMA aula com o prompt ORIGINAL de producao (A) e com uma versao
// ALTERADA (B) que troca UMA linha da FIDELITY RULE: manter fidelidade, mas
// explicar melhor os topicos que a aula abordou. A alteracao existe SO aqui —
// server/ai/prompts.js fica intocado.
//
//   A = prompt original de producao (baseline)
//   B = prompt original + a linha alterada (experimento)
//
// Mesmo modelo, mesma transcricao. Salva A.md, B.md e um comparativo cego.
//
// Uso:
//   node server/ai/spikeReadingCondense.mjs --title "IoC e DI"
//   node server/ai/spikeReadingCondense.mjs --transcript <_dub.txt|.vtt> --title "..."
// Flags: --instruction "..."  --model deepseek-...  --lang en  --out <dir>  --runs 1

import '../load-env.js';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { READING_CONDENSE_SYSTEM, buildReadingCondensePrompt } from './prompts.js';
import { parseTranscript } from './generator.js';
import { getCachedPrecondense } from './precondenseStore.js';

// A UNICA diferenca entre A e B. A linha original (baseline) e trocada pela
// alterada no prompt ja montado — assim isolamos exatamente essa variavel.
const ORIGINAL_LINE =
  '- Your job is to EXPLAIN BETTER what is in the transcript — NOT to expand the content.';
const MODIFIED_LINE =
  `- Your job is to EXPLAIN BETTER the topics the lesson covered — NOT to expand into new content.
  Keep FULL FIDELITY to WHAT the lesson taught (same topics, same scope, invent nothing), but improve
  HOW it is explained: make it clear and easy to understand. If the instructor was confusing, rushed,
  out of order, or mixed up two ideas, untangle it — state the "why" before the "how", clarify the
  confusing point, and give a cleaner explanation of THAT SAME topic. Deeper clarity of the covered
  topics: yes; new topics/facts the lesson did not teach: no.`;

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

// Amostra proposital de transcricao FRACA de IoC/DI (professor mistura os
// conceitos, pula o "por que"). O teste real e usar suas transcricoes via --transcript.
const SAMPLE_IOCDI = `
Beleza pessoal, entao hoje a gente vai falar de injecao de dependencia, DI, e
tambem de inversao de controle, IoC, que no fundo e a mesma ideia ta. Entao
assim, quando voce usa o Spring, voce poe la o arroba Autowired em cima do
atributo e o Spring injeta o bean pra voce, automatico. Isso ai e a inversao de
controle, e a injecao de dependencia. O container do Spring cria os objetos e
gerencia o ciclo de vida. Deixa eu mostrar aqui rapidinho no codigo... entao
olha, aqui eu tenho essa classe de servico e aqui em cima o Autowired, viu, e o
Spring resolve. Da pra fazer no construtor tambem mas a galera usa mais no campo
mesmo que e mais rapido de escrever. Enfim isso ai e o IoC, e o principio por
tras de tudo no Spring, o framework que controla. Qualquer duvida deixa nos
comentarios e ate a proxima.
`.trim();

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

const run = async () => {
  const title = arg('title', 'IoC e DI');
  const instruction = arg('instruction', '');
  const model = arg('model', DEFAULT_MODEL);
  const sourceLanguage = arg('lang', 'pt');
  const runs = Math.max(1, parseInt(arg('runs', '1'), 10));
  const outDir = resolve(arg('out', join('docs', 'spike-out')));
  const transcriptPath = arg('transcript');
  // Raiz onde vive o .precondense-cache (mesmo COURSES_PATH da producao).
  const coursesPath = arg('courses', process.env.COURSES_PATH || '.');
  // Por padrao usa o pre-condensado (input REAL do DeepSeek em producao); --raw pula.
  const usePrecondensed = !argv.includes('--raw');

  let transcript = SAMPLE_IOCDI;
  let fonte = 'AMOSTRA IoC/DI embutida';
  if (transcriptPath) {
    const parsed = await parseTranscript(transcriptPath); // mesma normalizacao da producao
    if (usePrecondensed) {
      const cached = await getCachedPrecondense(coursesPath, parsed.trim());
      if (cached != null) {
        transcript = cached;
        fonte = `${transcriptPath} [PRE-CONDENSADO do cache]`;
      } else {
        transcript = parsed;
        fonte = `${transcriptPath} [CRU — sem pre-condensado em cache!]`;
      }
    } else {
      transcript = parsed;
      fonte = `${transcriptPath} [CRU]`;
    }
  }

  await mkdir(outDir, { recursive: true });
  console.log(`[spike] titulo="${title}"  modelo=${model}  runs=${runs}`);
  console.log(`[spike] fonte=${fonte}  (${transcript.length} chars)`);
  console.log(`[spike] instruction=${instruction || '(nenhuma)'}\n`);

  const base = { lessonTitle: title, transcript, instruction, sourceLanguage };
  const promptA = buildReadingCondensePrompt(base);            // original de producao
  const promptB = promptA.replace(ORIGINAL_LINE, MODIFIED_LINE); // versao alterada (so no spike)
  if (promptB === promptA) {
    throw new Error('A linha original da FIDELITY RULE nao foi encontrada — o prompt de producao mudou. Ajuste ORIGINAL_LINE.');
  }

  const gen = async (user) => {
    const { content, usage, model: used } = await chatCompletion({ system: READING_CONDENSE_SYSTEM, user, model });
    return { content, cost: costFromUsage(usage, used), tokens: usage?.completion_tokens ?? 0 };
  };

  let totalCost = 0;
  for (let r = 1; r <= runs; r++) {
    const tag = runs > 1 ? `.run${r}` : '';
    process.stdout.write(`[spike] run ${r}: gerando A (original)... `);
    const a = await gen(promptA);
    process.stdout.write(`ok (${a.tokens} tok, $${a.cost.toFixed(5)}) | gerando B (alterado)... `);
    const b = await gen(promptB);
    console.log(`ok (${b.tokens} tok, $${b.cost.toFixed(5)})`);
    totalCost += a.cost + b.cost;

    await writeFile(join(outDir, `A_original${tag}.md`), a.content, 'utf8');
    await writeFile(join(outDir, `B_alterado${tag}.md`), b.content, 'utf8');

    // Comparativo CEGO: embaralha rotulos (v1/v2) pra julgar sem vies.
    const key = shuffle([{ real: 'A_original', ...a }, { real: 'B_alterado', ...b }])
      .map((x, i) => ({ ...x, label: `v${i + 1}` }));
    const blind = key.map((x) => `## Versao ${x.label}\n\n${x.content}\n`).join('\n---\n\n');
    await writeFile(join(outDir, `COMPARE_BLIND${tag}.md`), `# ${title}\n\n> Pontue as duas versoes ANTES de abrir o gabarito.\n\n${blind}`, 'utf8');
    await writeFile(join(outDir, `_gabarito${tag}.txt`), key.map((x) => `${x.label} = ${x.real}`).join('\n') + '\n', 'utf8');
  }

  console.log(`\n[spike] pronto -> ${outDir}`);
  console.log(`[spike] custo total: $${totalCost.toFixed(5)}`);
  console.log('[spike] producao (server/ai/prompts.js) NAO foi alterada.');
  console.log('[spike] abra COMPARE_BLIND*.md, pontue, depois confira _gabarito*.txt');
};

run().catch((e) => { console.error('[spike] ERRO:', e.message); process.exit(1); });
