// Ciclo de vida do Qwen3-VL (llama-server + mmproj) para OCR de diagramas.
// Espelha qwenServer.js (texto): start/stop/health, revezando VRAM.
//
// Sobe na porta 8081 (Qwen texto = 8080). So sobe quando o OCR de diagrama
// esta ligado (OCR_DIAGRAM_ENABLED). Derruba o Qwen texto (e vice-versa) pra
// nao estourar os 11GB da RTX 2080 Ti.
//
// Config .env:
//   VL_LLAMA_BIN   = caminho do llama-server (default: /mnt/nvme2/llm/llama.cpp/build/bin/llama-server)
//   VL_MODEL       = Qwen3VL-8B-Instruct-Q4_K_M.gguf
//   VL_MMPROJ      = mmproj-Qwen3VL-8B-Instruct-F16.gguf
//   VL_PORT        = 8081
//   VL_NGL         = 99 (offload GPU)
//   VL_CONTEXT     = 8192

import { spawn } from 'child_process';
import { killLlama, listLlamaPids } from '../modelProc.mjs';

const BASE = `http://127.0.0.1:${(process.env.VL_PORT || '8081').trim()}`;
const HEALTH_URL = `${BASE}/health`;
const MODELS_URL = `${BASE}/v1/models`;
const LLAMA_BIN = (process.env.VL_LLAMA_BIN || '/mnt/nvme2/llm/llama.cpp/build/bin/llama-server').trim();
const MODEL = (process.env.VL_MODEL || '/mnt/nvme2/llm/models/Qwen3VL-8B-Instruct-Q4_K_M.gguf').trim();
const MMPROJ = (process.env.VL_MMPROJ || '/mnt/nvme2/llm/models/mmproj-Qwen3VL-8B-Instruct-F16.gguf').trim();
const PORT = (process.env.VL_PORT || '8081').trim();
const NGL = (process.env.VL_NGL || '99').trim();
const CONTEXT = (process.env.VL_CONTEXT || '8192').trim();
const LD_LIB = `/opt/cuda/lib64:${LLAMA_BIN.replace(/\/llama-server$/, '')}`;
// Padrao do pgrep: llama-server do VL, discriminado pela porta (8081) — nunca
// casa o Qwen texto (8080). Kill dirigido pela EXISTENCIA do processo.
const PROC_PATTERN = `llama-server.*port ${PORT}`;

let spawned = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probe = async (url, ms = 2000) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
};

export const isVlUp = async () => (await probe(HEALTH_URL)) || (await probe(MODELS_URL));

// Sobe o Qwen3-VL se nao estiver no ar. Derruba o Qwen texto (e Kokoro) antes
// pra liberar VRAM. Idempotente.
export const startVl = async ({ timeoutMs = 180000, log = () => {} } = {}) => {
  if (await isVlUp()) {
    log('[vl] ja esta no ar');
    return true;
  }
  // Revezamento de VRAM: derruba o Qwen texto (porta 8080) e o Kokoro.
  try {
    const { stopQwen } = await import('./../qwenServer.js');
    await stopQwen({ log: () => {} });
  } catch {}
  try {
    const { stopKokoro } = await import('./../kokoro.js');
    await stopKokoro({ log: () => {} });
  } catch {}

  // Limpa zumbi ANTES de subir: VL pendurado no 8081 (health caido, processo
  // vivo) empilharia um segundo. No-op rapido se nao houver.
  await killLlama({ pattern: PROC_PATTERN, label: 'vl', log: () => {} });
  log('[vl] subindo Qwen3-VL...');
  spawned = spawn(LLAMA_BIN, [
    '-m', MODEL, '--mmproj', MMPROJ,
    '-ngl', NGL, '-c', CONTEXT,
    '--host', '127.0.0.1', '--port', PORT,
  ], {
    env: { ...process.env, LD_LIBRARY_PATH: `${LD_LIB}:${process.env.LD_LIBRARY_PATH || ''}` },
    stdio: 'ignore', detached: true,
  });
  spawned.unref?.();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2000);
    if (await isVlUp()) {
      log('[vl] pronto');
      return true;
    }
  }
  try { if (spawned?.pid) process.kill(-spawned.pid, 'SIGKILL'); } catch {}
  spawned = null;
  throw new Error('Qwen3-VL nao subiu no tempo esperado');
};

// Derruba o Qwen3-VL (o que subimos E qualquer instancia pendurada no 8081).
// Dirigido pela EXISTENCIA do processo (pgrep), nao pelo /health — um VL
// pendurado (health caido, processo vivo, segurando VRAM) tambem morre.
export const stopVl = async ({ timeoutMs = 30000, log = () => {} } = {}) => {
  const pid = spawned?.pid || null;
  spawned = null;
  return killLlama({ pattern: PROC_PATTERN, spawnedPid: pid, label: 'vl', timeoutMs, log });
};

// Diagnostico: PIDs de VL vivos (independe do /health).
export const vlPids = () => listLlamaPids(PROC_PATTERN);

// Faz uma chamada de visao (imagem + prompt) no VL. Retorna o texto de resposta.
export const askVl = async ({ imagePath, prompt, maxTokens = 1200, temperature = 0 } = {}) => {
  const { promises: fs } = await import('fs');
  const b64 = (await fs.readFile(imagePath)).toString('base64');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'local', temperature, max_tokens: maxTokens, stream: false,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`VL HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || '').trim();
  } finally {
    clearTimeout(t);
  }
};
