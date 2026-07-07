// AUDITORIA F1 (nao toca producao): roda as funcoes REAIS da normalizacao
// (buildNormMap = Qwen propoe -> DeepSeek veta) no modulo 04 e imprime o mapa.
// So le/limpa as transcricoes; NAO regenera aula nem escreve no DB.
import '../load-env.js';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { parseTranscript } from './generator.js';
import { preCondenseCached, buildNormMap, buildContract } from './precondense.js';
import { startQwen, stopQwen, isQwenUp } from './qwenServer.js';
import { INSTRUCTION_PRESETS } from '../../src/utils/instructionPresets.js';

const COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const COURSE = arg('course', 'Spring Rest-Construindo Web Services Poderosos');
const MODULE = arg('module', '04. Avançando com a API - Spring Security e JWT');

const run = async () => {
  const dir = join(COURSES_PATH, COURSE, MODULE);
  const files = (await readdir(dir)).filter((f) => /_dub\.txt$/.test(f)).sort();
  console.log(`[f1] ${files.length} aulas em "${MODULE}"`);

  console.log('[f1] subindo Qwen...');
  let up = false;
  try { up = await startQwen({ log: (m) => console.log(m) }); }
  catch (e) { console.error(`[f1] Qwen nao subiu: ${e.message}`); process.exit(1); }

  const RAW = argv.includes('--raw'); // extrai do texto CRU (como o spike fazia em curso NAO cacheado)
  console.log(RAW ? '[f1] coletando texto CRU (sem pre-condensar)...' : '[f1] pre-condensando (cache) + coletando texto limpo...');
  const cleaned = [];
  for (const f of files) {
    const raw = await parseTranscript(join(dir, f));
    const clean = RAW ? raw : await preCondenseCached(raw, true, COURSES_PATH, async () => up || await isQwenUp());
    cleaned.push(clean);
    process.stdout.write('.');
  }
  console.log('');

  console.log('[f1] === buildNormMap (Qwen propoe -> DeepSeek veta) ===');
  const { map, candidates, fingerprints } = await buildNormMap({
    texts: cleaned, contextTitle: MODULE, log: (m) => console.log(m),
  });

  // F4: sintetiza o CONTRATO a partir dos fingerprints + nicho (arg --nicho, default java).
  let contract = null;
  if (argv.includes('--contract')) {
    const nicho = arg('nicho', 'java');
    const preset = INSTRUCTION_PRESETS.find((p) => p.key === nicho);
    console.log(`\n[f4] === buildContract (nicho: ${nicho}) ===`);
    contract = await buildContract(fingerprints, preset ? preset.text : '');
  }

  try { await stopQwen({ log: () => {} }); } catch {}

  console.log('\n========== RESULTADO F1 ==========');
  console.log(`CANDIDATOS (Qwen propos): ${candidates.length ? candidates.map((c) => `${c.from}->${c.to}`).join(', ') : '(nenhum)'}`);
  console.log(`APLICADOS (DeepSeek vetou -> aplica): ${map.length ? map.map((c) => `${c.from}->${c.to}`).join(', ') : '(NENHUM — vet dropou tudo)'}`);
  const alf = candidates.find((c) => /alf/i.test(c.from));
  const alfKept = map.find((c) => /alf/i.test(c.from));
  console.log(`\n>> alf->auth: proposto=${alf ? 'SIM' : 'nao'} | mantido pelo vet=${alfKept ? 'SIM' : 'NAO'}`);

  if (contract) {
    console.log('\n========== CONTRATO F4 ==========\n' + contract.text + '\n=================================');
    const t = contract.text.toLowerCase();
    console.log(`\n>> contrato menciona /auth: ${/\/auth|"auth"|endpoint auth/.test(t) ? 'SIM' : 'nao'}`);
    console.log(`>> contrato fixa arquitetura de auth (token proprio/filtro vs resource server): ${/resource server|filtro|token/.test(t) ? 'SIM' : 'nao'}`);
  }
};

run().catch((e) => { console.error('[f1] ERRO:', e.message); process.exit(1); });
