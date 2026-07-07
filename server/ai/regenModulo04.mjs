// Regenera o modulo 04 (Security/JWT) pelo caminho de PRODUCAO (generateReadingBatch,
// que gerencia o Qwen), com F1+F2+F3+F4 ligados. Escreve no disco + DB (substitui a
// saida antiga bugada — TD-10). Nicho java. autoTranscribe off (as .txt ja existem).
import '../load-env.js';
import { generateReadingBatch } from './readingCourse.js';
import { INSTRUCTION_PRESETS } from '../../src/utils/instructionPresets.js';

const COURSE = 'Spring Rest-Construindo Web Services Poderosos';
const MODULE = '04. Avançando com a API - Spring Security e JWT';
const java = INSTRUCTION_PRESETS.find((p) => p.key === 'java');

const jobs = [{ courseTitle: COURSE, modulePath: MODULE, moduleTitle: MODULE, index: 4 }];

const t0 = Date.now();
const results = await generateReadingBatch({
  coursesPath: process.env.COURSES_PATH,
  jobs,
  instruction: java ? java.text : '',
  autoTranscribe: false, // .txt ja existem
  language: 'pt',
  preCondense: true, // Qwen (F1/F4 dependem)
  normalize: true,   // F1
  clarity: true,     // F3
  contract: true,    // F4
  onProgress: (ev) => {
    if (ev.type === 'phase') console.log(`[fase] ${ev.phase} ${ev.status}`);
    else if (ev.type === 'contract') console.log(`[F4] contrato: ${ev.chars} chars`);
    else if (ev.type === 'normalize') console.log(`[F1] normalizacao aplicada: ${(ev.applied || []).map((m) => `${m.from}->${m.to}`).join(', ') || '(nenhuma)'}`);
    else if (ev.type === 'plano') console.log(`[plano] ${ev.total} aulas`);
    else if (ev.type === 'aula' && ev.status === 'done') console.log(`  aula ${ev.i + 1} ${ev.ok ? 'ok' : 'FALHOU'}: ${ev.title}`);
    else if (ev.type === 'module-result') console.log(`[modulo] custo $${(ev.result?.cost || 0).toFixed(4)} | ${ev.result?.created?.filter((c) => c.ok).length}/${ev.result?.created?.length} aulas`);
  },
});

console.log(`\n[fim] ${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const r of results) {
  if (r.error) console.log(`  ERRO: ${r.error}`);
  else console.log(`  ${r.module}: ${r.created?.filter((c) => c.ok).length}/${r.originalLessons} aulas -> ${r.outDir}`);
}
