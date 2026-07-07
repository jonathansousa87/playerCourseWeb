// Gestao ROBUSTA de processos llama-server (Qwen texto e Qwen3-VL) para o
// revezamento de VRAM. Substitui a logica antiga que decidia "morto" pelo
// /health: um llama-server PENDURADO (health caido mas processo VIVO, ainda
// segurando VRAM/RAM) era tratado como ja-desligado e vazava. Aqui a decisao e
// pela EXISTENCIA REAL do processo (pgrep + /proc/<pid>/comm), escalando sempre
// SIGTERM -> SIGKILL ate o processo sumir de fato.

import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// comm real do PID (nome do executavel, <=15 chars). Blinda contra matar um
// shell que por acaso tenha o padrao no cmdline: so contamos processos cujo
// executavel e mesmo o llama-server.
const commOf = (pid) => {
  try { return readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { return ''; }
};

// PIDs de llama-server cujo cmdline casa com `pattern` (regex do pgrep -f).
// Filtra por comm === 'llama-server' (o binario real), nunca um shell/grep.
export const listLlamaPids = (pattern) =>
  new Promise((res) => {
    let out = '';
    const p = spawn('pgrep', ['-f', pattern]);
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => {
      const pids = [...new Set(
        out.split('\n').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0),
      )].filter((pid) => commOf(pid) === 'llama-server');
      res(pids);
    });
    p.on('error', () => res([]));
  });

const signal = (pid, sig) => { try { process.kill(pid, sig); } catch { /* ja morto */ } };
// Grupo do processo que NOS subimos (start.sh vira lider de sessao via exec).
const signalGroup = (pgid, sig) => { if (pgid) { try { process.kill(-pgid, sig); } catch { /* grupo ja morto */ } } };

// Mata TODO llama-server que casa com `pattern` (o que subimos + qualquer
// pendurado), dirigido pela existencia do processo. Retorna true quando nao
// sobra nenhum. `settleMs`: respiro pro driver liberar a VRAM antes de retornar.
export const killLlama = async ({ pattern, spawnedPid = null, label = 'model', timeoutMs = 20000, graceMs = 5000, settleMs = 1500, log = () => {} }) => {
  let pids = await listLlamaPids(pattern);
  if (!pids.length && !spawnedPid) return true;
  log(`[${label}] derrubando (PIDs: ${pids.join(', ') || 'grupo'}) pra liberar a VRAM`);

  signalGroup(spawnedPid, 'SIGTERM');
  for (const pid of pids) signal(pid, 'SIGTERM');

  const deadline = Date.now() + timeoutMs;
  const hardAt = Date.now() + Math.min(graceMs, timeoutMs);
  let hard = false;
  while (Date.now() < deadline) {
    await sleep(600);
    pids = await listLlamaPids(pattern);
    if (!pids.length) { await sleep(settleMs); log(`[${label}] derrubado`); return true; }
    // Passou a carencia e ainda ha processo vivo -> SIGKILL (inclusive nos
    // pendurados que ignoraram o TERM). Continua re-KILL nos que resistirem.
    if (Date.now() >= hardAt) {
      if (!hard) { log(`[${label}] SIGTERM nao bastou; escalando p/ SIGKILL`); hard = true; }
      signalGroup(spawnedPid, 'SIGKILL');
      for (const pid of pids) signal(pid, 'SIGKILL');
    }
  }
  pids = await listLlamaPids(pattern);
  if (pids.length) { log(`[${label}] AVISO: PIDs resistiram ao SIGKILL (${pids.join(', ')}) — possivel estado D (I/O de GPU travado)`); return false; }
  await sleep(settleMs);
  return true;
};
