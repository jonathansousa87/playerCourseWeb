// EXPERIMENTO (nao toca producao): roda o WhisperX 3x no MESMO audio variando o
// --initial_prompt (baseline / titulo da aula / vocab de nicho) e mede tempo, OOM,
// alucinacao (loops de repeticao + blowup de palavras) e acertos de termos-alvo.
//
// Uso: node server/ai/expWhisperInitialPrompt.mjs \
//        --course "..." --module "..." --lesson "07_07" --nicho java --lang pt
import '../load-env.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stopQwen } from './qwenServer.js';

const COURSES_PATH = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const COURSE = arg('course', 'Spring Rest-Construindo Web Services Poderosos');
const MODULE = arg('module', '04. Avançando com a API - Spring Security e JWT');
const LESSON = arg('lesson', 'Exigindo');
const NICHO = arg('nicho', 'java');
const LANG = arg('lang', 'pt');

// Vocab de nicho (o que um preset renderia): termos de dominio no FIM (a atencao pesa no fim).
const NICHE_VOCAB = {
  java: 'Curso de Java com Spring Boot e Spring Security. Vocabulário do domínio: REST, endpoint, autenticação, autorização, JWT, token Bearer, header Authorization, TokenService, UserDetails, AuthenticationManager, UsernamePasswordAuthenticationToken, SecurityFilterChain, OAuth2, Resource Server, dependency injection, Bean.',
  modelagem: 'Course on requirements and data modeling. Domain vocabulary: data flow diagram, DFD, Gane-Sarson notation, Yourdon notation, external entity, process, data store, data flow, entity relationship diagram, ERD, crow\'s foot notation, cardinality, swimlane, BPMN, use case.',
};

// Prompt "preservar termos EN" (ataca a raiz do /alf: termo ingles ouvido com sotaque
// PT e transcrito foneticamente). Instrucao + poucos exemplos no fim.
// v2 (refinado): instrucao PURA em EN, SEM lista de exemplos no fim (a lista foi o
// que disparou o Dev->IDF/perda de palavras no teste anterior).
const PRESERVE = 'This is a technical programming lecture where the speaker mixes Portuguese speech with English technical terms. Transcribe every English technical term in its correct English spelling, never as phonetic Portuguese.';

// Termos-alvo por nicho: {correto: regex, garble: regex} pra ver se o hint corrigiu.
const TERMS = {
  java: { auth: /\bauth\b|autentica|autoriza/gi, alf: /\balf\b|\/alf/gi, token: /token/gi, jwt: /jwt/gi },
  modelagem: {
    DFD: /\bdfd\b/gi, dft_garble: /\bdft\b/gi,
    Yourdon: /yourdon/gi, jordan_garble: /\bjordan\b/gi,
    GaneSarson: /gane|sarson/gi, sarsen_garble: /sarsen|sarsan/gi,
    ERD: /\berd\b|entity relationship/gi, crowfoot: /crow/gi,
  },
};

const BIN = (process.env.WHISPERX_BIN || '').trim();
const DEVICE = (process.env.WHISPERX_DEVICE || 'cuda').trim();
const MODEL = arg('model', LANG === 'en' ? ((process.env.WHISPERX_MODEL_EN || '').trim() || 'distil-large-v3.5') : ((process.env.WHISPERX_MODEL || '').trim() || 'large-v3-turbo'));
const splitBin = (bin) => { const p = bin.split(/\s+/).filter(Boolean); return { cmd: p[0], prefix: p.slice(1) }; };
const buildEnv = (bin) => {
  const env = { ...process.env }; const libs = [];
  const m = bin.match(/^(.*\/envs\/[^/\s]+)\/bin\//);
  if (m) { libs.push(`${m[1]}/lib`, '/opt/cuda/lib64', '/usr/lib'); env.PATH = `${m[1]}/bin:${env.PATH || ''}`; }
  if (libs.length) env.LD_LIBRARY_PATH = [...libs, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  return env;
};
const runWhisper = (audioFile, outDir, initialPrompt) => new Promise((resolve) => {
  const { cmd, prefix } = splitBin(BIN);
  const args = [...prefix,
    '--model', MODEL, '--device', DEVICE, '--compute_type', 'float16', '--batch_size', '8',
    '--output_dir', outDir, '--language', LANG, '--output_format', 'txt',
    '--condition_on_previous_text', 'False', '--vad_onset', '0.500', '--vad_offset', '0.363',
    '--no_speech_threshold', '0.6', '--logprob_threshold', '-1.0', '--compression_ratio_threshold', '2.4',
    ...(initialPrompt ? ['--initial_prompt', initialPrompt] : []),
    audioFile];
  const t0 = Date.now();
  const p = spawn(cmd, args, { env: buildEnv(BIN) });
  let out = '';
  p.stdout?.on('data', (d) => { out += d; }); p.stderr?.on('data', (d) => { out += d; });
  p.on('error', (e) => resolve({ code: -1, ms: Date.now() - t0, out: String(e) }));
  p.on('close', (code) => resolve({ code, ms: Date.now() - t0, out }));
});

const analyze = (txt) => {
  const words = txt.split(/\s+/).filter(Boolean);
  const lines = txt.split('\n').map((l) => l.trim()).filter(Boolean);
  let maxRun = 1, run = 1;
  for (let i = 1; i < lines.length; i++) { if (lines[i] === lines[i - 1]) { run++; maxRun = Math.max(maxRun, run); } else run = 1; }
  const grams = new Map(); let dup = 0, tot = 0;
  for (let i = 0; i + 5 <= words.length; i++) { const g = words.slice(i, i + 5).join(' ').toLowerCase(); tot++; const c = (grams.get(g) || 0) + 1; grams.set(g, c); if (c > 1) dup++; }
  const terms = {};
  for (const [k, re] of Object.entries(TERMS[NICHO] || {})) terms[k] = (txt.match(re) || []).length;
  return { words: words.length, maxRepeatRun: maxRun, repeat5gram: tot ? +(dup / tot).toFixed(3) : 0, terms };
};

const run = async () => {
  if (!BIN) { console.error('WHISPERX_BIN nao setado'); process.exit(1); }
  try { await stopQwen({ log: () => {} }); } catch {}
  const dir = join(COURSES_PATH, COURSE, MODULE);
  const files = (await fs.readdir(dir)).filter((f) => /\.mp4$/i.test(f) && f.includes(LESSON));
  if (!files.length) { console.error(`nenhum video com "${LESSON}" em ${dir}`); process.exit(1); }
  const video = join(dir, files[0]);
  const title = files[0].replace(/\.mp4$/i, '').replace(/^\d+[\s._-]*\d*\.?\s*/, '');
  console.log(`[exp] video: ${files[0]}`);
  console.log(`[exp] titulo: "${title}" | nicho: ${NICHO} | lang: ${LANG} | model: ${MODEL}\n`);

  const conditions = argv.includes('--minimal')
    ? [{ name: 'baseline', prompt: '' }, { name: 'preserve', prompt: PRESERVE }]
    : [{ name: 'baseline', prompt: '' }, { name: 'titulo  ', prompt: `${COURSE}. ${title}.` }, { name: 'preserve', prompt: PRESERVE }];
  if (argv.includes('--nicho-cond')) conditions.push({ name: 'nicho   ', prompt: NICHE_VOCAB[NICHO] || '' });

  const results = [];
  for (const c of conditions) {
    const outDir = await fs.mkdtemp(join(tmpdir(), 'wx-'));
    process.stdout.write(`[exp] rodando "${c.name.trim()}"... `);
    const r = await runWhisper(video, outDir, c.prompt);
    const oom = /out of memory/i.test(r.out) && /cuda/i.test(r.out);
    let txt = '';
    try { const f = (await fs.readdir(outDir)).find((x) => x.endsWith('.txt')); if (f) txt = await fs.readFile(join(outDir, f), 'utf8'); } catch {}
    const a = txt ? analyze(txt) : null;
    console.log(`${(r.ms / 1000).toFixed(1)}s${oom ? ' [OOM!]' : ''}${r.code !== 0 ? ` [exit ${r.code}]` : ''}`);
    results.push({ ...c, ms: r.ms, oom, code: r.code, a, txt, outDir, lastErr: r.out.trim().split('\n').slice(-2).join(' ') });
  }

  const termKeys = Object.keys(TERMS[NICHO] || {});
  console.log('\n========== RESULTADO ==========');
  console.log(`cond      | tempo | OOM | palavras | maxRep | rep5g | ${termKeys.join(' ')}`);
  for (const r of results) {
    const a = r.a || {};
    const tv = a.terms ? termKeys.map((k) => a.terms[k]).join(' ') : '-';
    console.log(`${r.name} | ${(r.ms / 1000).toFixed(1).padStart(4)}s |  ${r.oom ? 'S' : 'N'}  | ${String(a.words ?? '-').padStart(8)} | ${String(a.maxRepeatRun ?? '-').padStart(6)} | ${String(a.repeat5gram ?? '-').padStart(5)} | ${tv}`);
    if (r.code !== 0) console.log(`   erro: ${r.lastErr}`);
  }
  console.log(`\n(garbles = ${termKeys.filter((k) => k.includes('garble')).join(', ')}: MENOS e melhor. maxRep/rep5g alto = alucinacao.)`);
  for (const r of results) console.log(`\n----- ${r.name.trim()} (primeiros 320 chars) -----\n${(r.txt || '(sem txt)').slice(0, 320)}`);
  for (const r of results) { try { await fs.rm(r.outDir, { recursive: true, force: true }); } catch {} }
};

run().catch((e) => { console.error('[exp] ERRO:', e.message); process.exit(1); });
