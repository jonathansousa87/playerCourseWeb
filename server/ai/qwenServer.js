// Ciclo de vida do llama-server (Qwen) para REVEZAR a VRAM com o WhisperX.
// Numa GPU de 11GB nao cabem os dois (Qwen ~8GB + WhisperX ~5-6GB = OOM), entao
// a app sobe o Qwen SO na fase de pre-condensacao e o derruba antes (pro
// WhisperX) e depois (o DeepSeek e remoto, nao usa VRAM).
//
// - startQwen(): sobe via QWEN_START_CMD (default /mnt/nvme2/llm/start.sh) se o
//   endpoint nao responder; espera ficar pronto por polling no /health.
// - stopQwen(): mata QUALQUER llama-server (o que subimos OU o que o usuario
//   subiu manualmente) e espera o endpoint cair, liberando a VRAM.

import { spawn } from 'child_process';

// Deriva a base (http://host:porta) a partir da URL de chat do precondense.
const BASE = (process.env.PRECONDENSE_URL || 'http://127.0.0.1:8080/v1/chat/completions')
  .trim()
  .replace(/\/v1\/.*$/i, '')
  .replace(/\/+$/, '');
const HEALTH_URL = `${BASE}/health`;
const MODELS_URL = `${BASE}/v1/models`;
const START_CMD = (process.env.QWEN_START_CMD || '/mnt/nvme2/llm/start.sh').trim();
// Padrao pra casar o processo no kill (qualquer instancia do llama-server).
const PROC_MATCH = (process.env.QWEN_PROC_MATCH || 'llama-server').trim();

// pkill que so mata o Qwen TEXTO (porta 8080), sem afetar o Qwen3-VL (porta 8081).
// O VL tem o proprio stopVl no visionServer.mjs. Antes o pkill matava TODOS os
// llama-server — incluindo o VL, quebrando o revezamento.
const pkillText = (signal) =>
  new Promise((res) => {
    // Mata pelo modelo (Qwen3.5/Qwen_Qwen3.5) — especifico do texto, nao do VL.
    const p = spawn('pkill', [signal, '-f', 'Qwen_Qwen3.5']);
    p.on('close', res);
    p.on('error', res);
  });

let spawned = null; // processo que NOS subimos (se subimos)

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

export const isQwenUp = async () => (await probe(HEALTH_URL)) || (await probe(MODELS_URL));

// (pkill generico removido — usamos pkillText acima, especifico do Qwen texto)

// Sobe o Qwen se ainda nao estiver no ar e espera ficar pronto. Idempotente.
// Revezamento de VRAM: derruba o Kokoro E o Qwen3-VL antes de subir.
export const startQwen = async ({ timeoutMs = 120000, log = () => {} } = {}) => {
  if (await isQwenUp()) {
    log('[qwen] ja esta no ar');
    return true;
  }
  // Revezamento de VRAM: derruba o Qwen3-VL (se estiver no ar) e o Kokoro.
  try {
    const { stopVl } = await import('./ocr/visionServer.mjs');
    await stopVl({ log: () => {} });
  } catch (e) { log(`[qwen] nao consegui derrubar o VL: ${e.message}`); }
  try {
    const { stopKokoro } = await import('./kokoro.js');
    await stopKokoro({ log });
  } catch (e) { log(`[qwen] nao consegui derrubar o Kokoro: ${e.message}`); }
  log(`[qwen] subindo via: ${START_CMD}`);
  // shell+detached: start.sh faz `exec llama-server`, virando lider de sessao;
  // assim da pra matar o grupo inteiro no stop.
  spawned = spawn(START_CMD, { shell: true, detached: true, stdio: 'ignore' });
  spawned.unref?.();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(1500);
    if (await isQwenUp()) {
      log('[qwen] pronto');
      return true;
    }
  }
  throw new Error(`Qwen nao subiu em ${Math.round(timeoutMs / 1000)}s (cmd: ${START_CMD})`);
};

// Derruba o Qwen (qualquer instancia) e espera o endpoint cair + a VRAM liberar.
export const stopQwen = async ({ timeoutMs = 30000, log = () => {} } = {}) => {
  if (!spawned && !(await isQwenUp())) return true;
  log('[qwen] derrubando pra liberar a VRAM');

  try { if (spawned?.pid) process.kill(-spawned.pid, 'SIGTERM'); } catch { /* grupo ja morto */ }
  await pkillText('-TERM');
  spawned = null;

  const deadline = Date.now() + timeoutMs;
  let killedHard = false;
  while (Date.now() < deadline) {
    await sleep(1000);
    if (!(await isQwenUp())) {
      // respiro pro driver liberar a VRAM de fato antes do WhisperX/proximo passo.
      await sleep(1500);
      log('[qwen] derrubado');
      return true;
    }
    if (!killedHard) { await pkillText('-KILL'); killedHard = true; }
  }
  throw new Error('Qwen nao derrubou no tempo esperado');
};
