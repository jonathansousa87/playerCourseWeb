// SPIKE OCR (nao toca producao): sobe o Qwen3-VL local (llama-server + mmproj),
// manda keyframes de uma aula, extrai os identificadores de codigo da TELA e checa
// se pega os termos EXATOS que o audio errou (/auth, AuthenticationController,
// rasmooplus). Prova que o OCR e ground-truth p/ alimentar o contrato (F4).
//
// Uso: node server/ai/spikeOcrVL.mjs <pasta_de_frames> [--n 8]
import '../load-env.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

const LLAMA = '/mnt/nvme2/llm/llama.cpp/build/bin';
const MODEL = '/mnt/nvme2/llm/models/Qwen3VL-8B-Instruct-Q4_K_M.gguf';
const MMPROJ = '/mnt/nvme2/llm/models/mmproj-Qwen3VL-8B-Instruct-F16.gguf';
const PORT = 8081;
const BASE = `http://127.0.0.1:${PORT}`;
const argv = process.argv.slice(2);
const FRAMES_DIR = argv.find((a) => !a.startsWith('--')) || '';
const N = Number((argv[argv.indexOf('--n') + 1]) || 8);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = async () => { try { const r = await fetch(`${BASE}/health`); return r.ok; } catch { return false; } };

// Prompt de OCR: transcrever EXATO o codigo/identificadores visiveis (nao interpretar).
const PROMPT = 'You are reading a screenshot of an IDE (IntelliJ) showing Java code and a project tree. Transcribe EXACTLY the technical identifiers visible on screen — class names, method names, HTTP endpoints/routes (e.g. "/auth"), package names, annotations, file names, SQL/migration names. Copy the spelling CHARACTER BY CHARACTER as shown; do NOT correct, translate, or infer. Output a plain list, one identifier per line, nothing else.';

const ocrFrame = async (path) => {
  const b64 = (await fs.readFile(path)).toString('base64');
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'local', temperature: 0, max_tokens: 1200, stream: false,
      messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
};

const run = async () => {
  if (!FRAMES_DIR) { console.error('uso: node spikeOcrVL.mjs <pasta_frames> [--n 8]'); process.exit(1); }
  for (const f of [MODEL, MMPROJ]) { try { await fs.access(f); } catch { console.error(`falta o modelo: ${f}`); process.exit(1); } }

  // libera VRAM (derruba o Qwen texto se estiver no ar)
  try { const { stopQwen } = await import('./qwenServer.js'); await stopQwen({ log: () => {} }); } catch {}

  console.log('[ocr] subindo Qwen3-VL local...');
  const srv = spawn(`${LLAMA}/llama-server`, [
    '-m', MODEL, '--mmproj', MMPROJ, '-ngl', '99', '-c', '8192',
    '--host', '127.0.0.1', '--port', String(PORT),
  ], { env: { ...process.env, LD_LIBRARY_PATH: `/opt/cuda/lib64:${LLAMA}` }, stdio: 'ignore', detached: true });
  srv.unref?.();

  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) { if (await probe()) break; await sleep(2000); }
  if (!(await probe())) { console.error('[ocr] VL nao subiu'); try { process.kill(-srv.pid, 'SIGKILL'); } catch {} process.exit(1); }
  console.log('[ocr] VL pronto\n');

  const all = (await fs.readdir(FRAMES_DIR)).filter((f) => /\.png$/i.test(f)).sort();
  const step = Math.max(1, Math.floor(all.length / N));
  const chosen = all.filter((_, i) => i % step === 0).slice(0, N);
  console.log(`[ocr] ${all.length} frames -> OCR em ${chosen.length}\n`);

  const bag = new Set();
  for (const f of chosen) {
    process.stdout.write(`[ocr] ${f}... `);
    try {
      const t0 = Date.now();
      const out = await ocrFrame(join(FRAMES_DIR, f));
      for (const line of out.split('\n')) { const s = line.trim().replace(/^[-*\d.\s]+/, ''); if (s.length >= 2) bag.add(s); }
      console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s (${out.split('\n').length} linhas)`);
    } catch (e) { console.log(`ERRO: ${e.message}`); }
  }

  try { process.kill(-srv.pid, 'SIGTERM'); } catch {}

  const ids = [...bag].sort();
  console.log(`\n========== IDENTIFICADORES EXTRAIDOS (${ids.length}) ==========`);
  console.log(ids.join('\n'));
  const has = (re) => ids.some((x) => re.test(x));
  console.log('\n========== CHECAGEM (termos que o AUDIO errou) ==========');
  console.log(`  /auth (era /alf):            ${has(/\/auth\b/i) ? 'ACHOU ✓' : 'nao'}`);
  console.log(`  AuthenticationController:     ${has(/AuthenticationController/i) ? 'ACHOU ✓' : 'nao'}`);
  console.log(`  WebSecurityConfig:           ${has(/WebSecurityConfig/i) ? 'ACHOU ✓' : 'nao'}`);
  console.log(`  rasmooplus (era Hasmoo Plus): ${has(/rasmooplus/i) ? 'ACHOU ✓' : 'nao'}`);
  console.log(`  TokenService:                ${has(/TokenService/i) ? 'ACHOU ✓' : 'nao'}`);
};

run().catch((e) => { console.error('[ocr] ERRO:', e.message); process.exit(1); });
