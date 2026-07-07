// SPIKE (nao toca producao): A/B de TEXTO entre o Qwen3.5-9B (texto, atual) e o
// Qwen3-VL-8B (usado como texto puro), com os MESMOS prompts EN de producao
// (pre-condensacao + fingerprint). Sequencial (revezam VRAM). So compara qualidade.
import '../load-env.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

const LLAMA = '/mnt/nvme2/llm/llama.cpp/build/bin';
const PORT = 8090;
const BASE = `http://127.0.0.1:${PORT}`;
const MODELS = [
  { name: 'Qwen3.5-9B (texto atual)', args: ['-m', '/mnt/nvme2/llm/models/Qwen_Qwen3.5-9B-Q4_K_M.gguf', '--reasoning', 'off'] },
  { name: 'Qwen3-VL-8B (como texto)', args: ['-m', '/mnt/nvme2/llm/models/Qwen3VL-8B-Instruct-Q4_K_M.gguf'] },
];

// Prompts VERBATIM de producao (precondense.js)
const PRECOND_SYSTEM = `You receive the TRANSCRIPT of a technical programming video lesson (the instructor's speech, automatically transcribed). Convert this SPOKEN text into a READING text: the same content and the same didactic flow, rewritten as reading prose, WITHOUT the conversational tone. Rules:
- REMOVE the orality: filler words, hesitations, typing self-corrections ('oops, wrong'), direct address to the student ('see?', 'got it?', 'okay so far?', 'remember this?') and the step-by-step narration of typing in the IDE ('I'll put this here', 'let me see', 'up here'). Instead of narrating the typing, DESCRIBE what the code does and what is being built.
- STAY FAITHFUL: preserve all technical content (concepts, names of classes/methods/annotations, code, JPQL/SQL, steps, examples and warnings) and the teaching order. You rewrite the TONE, never change the CONTENT.
- DO NOT MODERNIZE: reproduce the APIs, versions and practices exactly as taught, even if outdated. Do not swap them for modern equivalents and do not add anything that was not said (modernization is handled later, by another stage).
- DO NOT INFER OR COMPLETE. If the instructor considered an alternative and discarded it, record only the final decision. Reproduce identifiers (parameters, variables, values, routes) EXACTLY as he decided to use them. Describe behavior exactly as stated (a LIKE with '%' on both sides means 'contains', not 'starts with'). Never name a class, method or exception that he did not explicitly mention.
- DO NOT TRANSLATE: keep the SAME language as the transcript. Keep technical terms as they were spoken.
- Do not comment or add your own headings/conclusions. Respond ONLY with the reading text.`;

const FP_SYSTEM = `This text was auto-transcribed from a VIDEO (speech-to-text), so some DOMAIN/TECHNICAL terms may be GARBLED (a non-standard word that, in context, is clearly a mis-heard known term — a tool, notation, method, class, endpoint, ingredient, etc.). NEVER assume the domain (programming, modeling/diagrams, cooking, finance...). Extract a COMPACT fingerprint from ONE lesson. Output EXACTLY these 4 lines, nothing else, values in Portuguese:
TERMOS: <comma list of the tools/notations/methods/frameworks/named concepts used>
ARTEFATOS: <comma list of the concrete named things the lesson creates or uses (classes, endpoints, entities, diagram types, notations, symbols, recipes...), with their REAL names>
ABORDAGEM: <one short line: the key technique/method/notation-choice the lesson teaches, incl. any convention it fixes (e.g. a notation variant, a naming style)>
CORRECOES: <speech-to-text errors of domain/technical terms, as "wrong->right" pairs separated by comma (e.g. "alf->auth"); be CONSERVATIVE — only OBVIOUS ones; if none, "-">`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } };
const strip = (s) => (s || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

const chat = async (system, user, maxTokens) => {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'local', temperature: 0.1, max_tokens: maxTokens, stream: false,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return strip((await res.json())?.choices?.[0]?.message?.content || '');
};

const run = async () => {
  try { const { stopQwen } = await import('./qwenServer.js'); await stopQwen({ log: () => {} }); } catch {}
  const SRC = '/mnt/nvme2/kadabra/Downloads/cursos/Spring Rest-Construindo Web Services Poderosos/04. Avançando com a API - Spring Security e JWT';
  const transcript = (await fs.readFile(join(SRC, '07_07. Torando a autenticação stateless_dub.txt'), 'utf8')).trim();
  console.log(`[ab] input: aula 07 (${transcript.split(/\s+/).length} palavras)\n`);

  const out = {};
  for (const m of MODELS) {
    console.log(`\n########## ${m.name} ##########`);
    const srv = spawn(`${LLAMA}/llama-server`, [...m.args, '-ngl', '99', '-c', '16384', '--host', '127.0.0.1', '--port', String(PORT)],
      { env: { ...process.env, LD_LIBRARY_PATH: `/opt/cuda/lib64:${LLAMA}` }, stdio: 'ignore', detached: true });
    srv.unref?.();
    const dl = Date.now() + 180000; while (Date.now() < dl && !(await probe())) await sleep(2000);
    if (!(await probe())) { console.log('  (nao subiu)'); try { process.kill(-srv.pid, 'SIGKILL'); } catch {} continue; }
    try {
      const t0 = Date.now();
      const pre = await chat(PRECOND_SYSTEM, transcript, 4096);
      const fp = await chat(FP_SYSTEM, transcript.slice(0, 6000), 400);
      out[m.name] = { pre, fp, ms: Date.now() - t0 };
      console.log(`  ok (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) { console.log(`  ERRO: ${e.message}`); }
    try { process.kill(-srv.pid, 'SIGTERM'); } catch {}
    await sleep(3000);
  }

  for (const m of MODELS) {
    const r = out[m.name]; if (!r) continue;
    console.log(`\n==================== ${m.name} (${(r.ms / 1000).toFixed(0)}s) ====================`);
    console.log('--- FINGERPRINT ---\n' + r.fp);
    console.log('\n--- PRE-CONDENSACAO (primeiros 900 chars) ---\n' + r.pre.slice(0, 900));
    console.log(`\n[stats] pre-condensacao: ${r.pre.split(/\s+/).length} palavras | traduziu p/ EN? ${/\b(the|and|is|to be|we will|then)\b/i.test(r.pre.slice(0, 400)) ? 'SUSPEITO' : 'nao (manteve PT)'}`);
  }
};

run().catch((e) => { console.error('[ab] ERRO:', e.message); process.exit(1); });
