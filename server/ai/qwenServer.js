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
import { killLlama, listLlamaPids } from './modelProc.mjs';

// Deriva a base (http://host:porta) a partir da URL de chat do precondense.
const BASE = (process.env.PRECONDENSE_URL || 'http://127.0.0.1:8080/v1/chat/completions')
  .trim()
  .replace(/\/v1\/.*$/i, '')
  .replace(/\/+$/, '');
const HEALTH_URL = `${BASE}/health`;
const MODELS_URL = `${BASE}/v1/models`;
const START_CMD = (process.env.QWEN_START_CMD || '/mnt/nvme2/llm/start.sh').trim();
// Porta do Qwen TEXTO (derivada da BASE, default 8080). Discrimina o texto do
// Qwen3-VL (8081) de forma confiavel no kill — independe do nome do modelo.
const PORT = (BASE.match(/:(\d+)/) || [])[1] || '8080';
// Padrao do pgrep: llama-server cujo cmdline tem `--port <PORT>` (o proprio texto,
// nunca o VL). Dirigido pela EXISTENCIA do processo, nao pelo /health.
const PROC_PATTERN = `llama-server.*port ${PORT}`;

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
  // Limpa zumbi ANTES de subir: se ha um texto PENDURADO no 8080 (health caido
  // mas processo vivo), o spawn empilharia um segundo. killLlama e no-op rapido
  // se nao houver nenhum.
  await killLlama({ pattern: PROC_PATTERN, label: 'qwen', log: () => {} });
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

// Derruba o Qwen texto (o que subimos E qualquer instancia pendurada no 8080) e
// espera a VRAM liberar. Dirigido pela EXISTENCIA do processo (pgrep), nao pelo
// /health — um servidor pendurado (health caido, processo vivo) tambem morre.
export const stopQwen = async ({ timeoutMs = 30000, log = () => {} } = {}) => {
  const pid = spawned?.pid || null;
  spawned = null;
  return killLlama({ pattern: PROC_PATTERN, spawnedPid: pid, label: 'qwen', timeoutMs, log });
};

// Diagnostico: PIDs de Qwen texto vivos (independe do /health).
export const qwenPids = () => listLlamaPids(PROC_PATTERN);
