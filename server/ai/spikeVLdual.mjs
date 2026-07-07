// SPIKE (nao toca producao): sobe o Qwen3-VL local e testa DOIS papeis:
//  (A) frame de CODIGO -> transcrever identificadores EXATOS (comparar c/ PaddleOCR)
//  (B) frame de DIAGRAMA -> extrair ESTRUTURA em JSON {type,notation,nodes,edges}
// Uso: node server/ai/spikeVLdual.mjs <frame_codigo.png> <frame_diagrama.png>
import '../load-env.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const LLAMA = '/mnt/nvme2/llm/llama.cpp/build/bin';
const MODEL = '/mnt/nvme2/llm/models/Qwen3VL-8B-Instruct-Q4_K_M.gguf';
const MMPROJ = '/mnt/nvme2/llm/models/mmproj-Qwen3VL-8B-Instruct-F16.gguf';
const PORT = 8081;
const BASE = `http://127.0.0.1:${PORT}`;
const [CODE_IMG, DIAG_IMG] = process.argv.slice(2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } };

const CODE_PROMPT = 'This is a screenshot of an IDE showing Java code. Transcribe EXACTLY the technical identifiers visible: class names, HTTP endpoints/routes (e.g. "/auth"), method names, package names, annotations, file names. Copy the spelling CHARACTER BY CHARACTER; do NOT correct, translate or normalize. Output a plain list, one per line.';
const DIAG_PROMPT = 'This image is a diagram (likely a Data Flow Diagram). Extract its STRUCTURE. Output STRICT JSON only, no prose: {"type": "...", "notation": "...", "nodes": [{"label": "...", "kind": "external_entity|process|data_store"}], "edges": [{"from": "...", "to": "...", "label": "..."}]}. Copy every label EXACTLY as written on the diagram. Include ALL nodes and ALL arrows.';

const ask = async (imgPath, prompt, maxTokens) => {
  const b64 = (await fs.readFile(imgPath)).toString('base64');
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'local', temperature: 0, max_tokens: maxTokens, stream: false,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json())?.choices?.[0]?.message?.content || '').trim();
};

const run = async () => {
  for (const f of [MODEL, MMPROJ, CODE_IMG, DIAG_IMG]) { try { await fs.access(f); } catch { console.error(`falta: ${f}`); process.exit(1); } }
  try { const { stopQwen } = await import('./qwenServer.js'); await stopQwen({ log: () => {} }); } catch {}

  console.log('[vl] subindo Qwen3-VL...');
  const srv = spawn(`${LLAMA}/llama-server`, ['-m', MODEL, '--mmproj', MMPROJ, '-ngl', '99', '-c', '8192', '--host', '127.0.0.1', '--port', String(PORT)],
    { env: { ...process.env, LD_LIBRARY_PATH: `/opt/cuda/lib64:${LLAMA}` }, stdio: 'ignore', detached: true });
  srv.unref?.();
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && !(await probe())) await sleep(2000);
  if (!(await probe())) { console.error('[vl] nao subiu'); try { process.kill(-srv.pid, 'SIGKILL'); } catch {} process.exit(1); }
  console.log('[vl] pronto\n');

  try {
    console.log('========== (A) CODIGO — Qwen3-VL ('  + CODE_IMG.split('/').pop() + ') ==========');
    const t0 = Date.now();
    const code = await ask(CODE_IMG, CODE_PROMPT, 1200);
    console.log(code);
    console.log(`\n[A] ${((Date.now() - t0) / 1000).toFixed(1)}s | /auth: ${/\/auth\b/i.test(code) ? 'SIM' : 'nao'} | /alf (normalizou p/ errado?): ${/\/alf\b/i.test(code) ? 'SIM' : 'nao'}`);

    console.log('\n========== (B) DIAGRAMA — Qwen3-VL (' + DIAG_IMG.split('/').pop() + ') ==========');
    const t1 = Date.now();
    const diag = await ask(DIAG_IMG, DIAG_PROMPT, 2000);
    console.log(diag);
    console.log(`\n[B] ${((Date.now() - t1) / 1000).toFixed(1)}s | menciona Yourdon: ${/yourdon/i.test(diag) ? 'SIM ✓' : 'nao'} | tem nodes/edges: ${/"nodes"/.test(diag) && /"edges"/.test(diag) ? 'SIM ✓' : 'nao'}`);
  } finally {
    try { process.kill(-srv.pid, 'SIGTERM'); } catch {}
  }
};

run().catch((e) => { console.error('[vl] ERRO:', e.message); process.exit(1); });
