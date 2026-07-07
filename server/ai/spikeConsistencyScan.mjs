// Escaneia os .md JA gerados (docs/spike-out) com o detector endurecido
// (camada 1 string + camada 2 semantica). Sobe o Qwen do MESMO jeito que a
// aplicacao (startQwen) e o derruba no fim (stopQwen) — sem pedir nada ao usuario.
// Nao regenera nada no DeepSeek (custo pago zero; Qwen e local).
//
// Uso: node server/ai/spikeConsistencyScan.mjs

import '../load-env.js';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { extractArtifacts, driftReport } from './readingConsistency.mjs';
import { startQwen, stopQwen, isQwenUp } from './qwenServer.js';

const DIR = join(process.cwd(), 'docs/spike-out');
const log = (m) => console.log(m);

const readSet = (suffix) =>
  readdirSync(DIR).filter((f) => f.endsWith(suffix)).sort().map((f) => readFileSync(join(DIR, f), 'utf8'));

const THINK = !process.argv.includes('--no-think'); // thinking ligado por padrao neste teste
const scan = async (label, texts) => {
  const per = texts.map(extractArtifacts);
  const r = await driftReport(per, { useSemantic: true, think: THINK });
  console.log(`\n  === ${label} (${texts.length} aulas) ===`);
  console.log(`  endpoints: ${r.endpoints.join(', ') || '-'}`);
  console.log(`  camada 2 (Qwen): ${r.semantic.ok ? 'ATIVA' : `indisponivel (${r.semantic.error})`}`);
  console.log(`  drift REAL (camada 1 + 2): ${r.driftCount}`);
  r.driftGroups.forEach((g) => console.log(`    - {${g.join(' == ')}}`));
  return r.driftCount;
};

const run = async () => {
  const base = readSet('__BASELINE.md');
  const contract = readSet('__CONTRATO.md');
  if (!base.length) { console.error('sem arquivos __BASELINE.md em docs/spike-out — rode o spikeGlossaryContract antes.'); process.exit(1); }

  console.log('[scan] subindo o Qwen (mesmo mecanismo da app: startQwen)...');
  let up = false;
  try {
    up = await startQwen({ log });
  } catch (e) {
    console.warn(`[scan] Qwen nao subiu (${e.message}) — segue so com camada 1.`);
  }

  try {
    const dBase = await scan('BASELINE (sem glossario)', base);
    const dContract = await scan('CONTRATO (com glossario)', contract);
    console.log(`\n[scan] RESULTADO -> drift baseline=${dBase}  contrato=${dContract}`);
  } finally {
    if (up || (await isQwenUp())) {
      console.log('\n[scan] derrubando o Qwen (stopQwen) pra liberar a VRAM...');
      try { await stopQwen({ log }); } catch (e) { console.warn(`[scan] falha ao derrubar: ${e.message}`); }
    }
  }
};

run().catch((e) => { console.error('[scan] ERRO:', e.message); process.exit(1); });
