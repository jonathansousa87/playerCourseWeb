// Cliente do Kokoro TTS (mesmo server que o DubAI usa) pra gerar os podcasts.
// API compativel-OpenAI: POST /v1/audio/speech {model, input, voice, lang_code,
// response_format, speed, ...} -> bytes do audio. Suporta BLENDING de vozes com
// "+" (ex.: "pm_santa+em_santa"). Roda em docker (kokoro-fastapi-gpu, porta 8880).
//
// .env:
//   KOKORO_URL        = http://127.0.0.1:8880
//   KOKORO_START_CMD  = docker start kokoro-container   (sobe sozinho se cair)

import { spawn } from 'child_process';

const url = () => (process.env.KOKORO_URL || 'http://127.0.0.1:8880').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const err = (code, message) => {
  const e = new Error(message);
  e.code = code;
  return e;
};

const reachable = async () => {
  try {
    // timeout curto: sem Kokoro a conexao e recusada na hora, mas se a porta
    // existir e nao responder (firewall) o boot/rota nao deve pendurar.
    const r = await fetch(`${url()}/v1/audio/voices`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
};

// Aquece o modelo: o /v1/audio/voices responde ANTES do modelo conseguir
// sintetizar (cold-start). Sem isso, a 1ª fala do 1º podcast falhava. Faz um
// clip minusculo e so retorna quando o Kokoro de fato gera audio.
const warmup = async () => {
  for (let i = 0; i < 15; i++) {
    try {
      const r = await fetch(`${url()}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'kokoro', input: 'ok', voice: 'pf_dora', lang_code: 'p', response_format: 'wav', speed: 1.0 }),
      });
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 256) return;
      }
    } catch { /* ainda carregando */ }
    await sleep(2000);
  }
  // Nao aquecida em ~30s: segue mesmo assim (o synthesize ainda re-tenta).
};

// Derruba o Kokoro (container docker) pra liberar a VRAM — usado pelo
// revezamento: o Qwen (llama-server) e o Kokoro nao cabem juntos na GPU de 11GB.
export const stopKokoro = async ({ log = () => {} } = {}) => {
  cancelIdleStop(); // um stop explicito (revezamento/ocioso) cancela o timer pendente
  if (!(await reachable())) return true;
  const cmd = (process.env.KOKORO_STOP_CMD ?? 'docker stop kokoro-container').trim();
  if (!cmd) return false;
  log('[kokoro] derrubando pra liberar a VRAM');
  await new Promise((res) => {
    const p = spawn(cmd, { shell: true, stdio: 'ignore' });
    p.on('close', res);
    p.on('error', res);
  });
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    if (!(await reachable())) { await sleep(1000); log('[kokoro] derrubado'); return true; }
  }
  return true;
};

// IDLE-STOP com debounce: o Kokoro segura ~1.3GB de VRAM enquanto o container
// esta no ar. Nada o derrubava depois da narracao (so o revezamento, quando o
// Qwen/VL precisava da GPU) — entao apos gerar as narracoes ele ficava pendurado.
// Aqui cada sintese (re)agenda um stop; enquanto voce gera aula atras de aula o
// timer se renova (sem cold-start); parou de gerar -> apos KOKORO_IDLE_STOP_MS
// (default 120s; 0 desliga) o container cai sozinho e libera a VRAM.
let idleTimer = null;
const IDLE_STOP_MS = Math.max(0, parseInt(process.env.KOKORO_IDLE_STOP_MS || '120000', 10) || 0);
const cancelIdleStop = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };
const scheduleIdleStop = () => {
  if (!IDLE_STOP_MS) return;
  cancelIdleStop();
  idleTimer = setTimeout(async () => {
    idleTimer = null;
    if (kkActive > 0) { scheduleIdleStop(); return; } // ainda sintetizando -> adia
    try { await stopKokoro({ log: (m) => console.log(m) }); } catch { /* best-effort */ }
  }, IDLE_STOP_MS);
  idleTimer.unref?.();
};

// Garante o Kokoro no ar E com o modelo pronto pra sintetizar. Se cair, tenta
// subir o container (configuravel). Em docker o boot + carga leva ~15-30s.
export const ensureServer = async () => {
  cancelIdleStop(); // vamos usar o Kokoro agora: cancela um stop-por-ociosidade pendente
  // Revezamento de VRAM: antes de subir/usar o Kokoro, derruba o Qwen (se estiver
  // no ar) pra liberar a GPU. Import dinamico p/ evitar ciclo com qwenServer.
  try {
    const { stopQwen } = await import('./qwenServer.js');
    await stopQwen({ log: (m) => console.log(m) });
  } catch (e) { console.warn('[kokoro] nao consegui derrubar o Qwen:', e.message); }

  let up = await reachable();
  if (!up) {
    const startCmd = (process.env.KOKORO_START_CMD ?? 'docker start kokoro-container').trim();
    if (startCmd) {
      await new Promise((resolve) => {
        const p = spawn(startCmd, { shell: true, stdio: 'ignore' });
        p.on('close', resolve);
        p.on('error', resolve);
      });
    }
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      if (await reachable()) { up = true; break; }
    }
    if (!up) {
      throw err('NO_KOKORO', 'Kokoro nao respondeu em :8880 (suba o container kokoro ou ajuste KOKORO_URL/KOKORO_START_CMD)');
    }
  }
  await warmup();
};

// Workarounds de pronuncia PT-BR (lang_code "p" + eSpeak), iguais ao DubAI:
// - "é"/"É" isolado vira "éé"/"Éé" (eSpeak senao le "e agudo");
// - interjeicoes sem vogal (hmm, mm, shh...) sao escritas foneticamente;
// - remove "né?" (cacoete repetitivo da fala/traducao).
const prepText = (t) =>
  String(t)
    .replace(/(?<=\s|^)é(?=\s|[.,!?]|$)/g, 'éé')
    .replace(/(?<=\s|^)É(?=\s|[.,!?]|$)/g, 'Éé')
    .replace(/\bhmm+\b/gi, 'Humm')
    .replace(/\bhm\b/gi, 'Hum')
    .replace(/\bmm-hmm+\b/gi, 'Hum-hum')
    .replace(/\bmm+\b/gi, 'Humm')
    .replace(/\bshh+\b/gi, 'Xii')
    .replace(/,?\s*né(?=\?)/g, '');

// Semaforo de concorrencia, igual ao DubAI (Semaphore(4)): o Kokoro aguenta
// bem ate 4 sinteses simultaneas. Serializar tudo (fila unica) criava um
// engargalamento gigante quando varias aulas geram podcast ao mesmo tempo.
const KOKORO_CONCURRENCY = Math.max(1, parseInt(process.env.KOKORO_CONCURRENCY || '4', 10));
let kkActive = 0;
const kkWaiters = [];
const kkAcquire = () => new Promise((resolve) => {
  if (kkActive < KOKORO_CONCURRENCY) { kkActive += 1; resolve(); }
  else kkWaiters.push(resolve);
});
const kkRelease = () => {
  const next = kkWaiters.shift();
  if (next) next();
  else kkActive = Math.max(0, kkActive - 1);
};

// Sintetiza uma fala. `voice` pode ser uma voz ("pf_dora") ou um blend
// ("pm_santa+em_santa"). lang_code "p" = portugues. Re-tenta em falha transitoria.
export const synthesize = async (args) => {
  await kkAcquire();
  try {
    return await synthesizeNow(args);
  } finally {
    kkRelease();
    scheduleIdleStop(); // apos a ultima sintese, o timer derruba o Kokoro sozinho
  }
};

// Fonemiza um trecho num idioma (endpoint /dev/phonemize do Kokoro-FastAPI:
// "a" = ingles americano, "p" = portugues). Usado pela normalizacao de
// pronuncia por fonema splicing (narration.js): fonemiza termo tecnico em
// INGLES de verdade e cola no meio do fonema PORTUGUES do resto da frase —
// mais fiel que aproximar a grafia. Se o endpoint nao existir (imagem Kokoro
// mais antiga), marca indisponivel pro resto do processo (nao insiste a cada
// chamada) e o chamador cai pro synthesize() de texto puro.
let devEndpointsOk = null; // null=desconhecido, true/false=checado
export const phonemizeText = async ({ text, language = 'p' }) => {
  if (devEndpointsOk === false) throw err('NO_DEV_ENDPOINTS', 'endpoints /dev/* do Kokoro indisponiveis (ja checado)');
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(`${url()}/dev/phonemize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }), signal: ctrl.signal,
    });
    if (!r.ok) {
      if (r.status === 404) devEndpointsOk = false;
      throw new Error(`kokoro /dev/phonemize HTTP ${r.status}`);
    }
    devEndpointsOk = true;
    const { phonemes } = await r.json();
    return phonemes || '';
  } finally {
    clearTimeout(to);
  }
};

// Sintetiza a partir de uma string de fonemas JA PRONTA (mistura de idiomas
// possivel — ver phonemizeText). Mesmo semaforo/idle-stop de synthesize().
export const synthesizeFromPhonemes = async ({ phonemes, voice }) => {
  await kkAcquire();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const r = await fetch(`${url()}/dev/generate_from_phonemes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phonemes, voice }), signal: ctrl.signal,
      });
      if (!r.ok) {
        if (r.status === 404) devEndpointsOk = false;
        throw new Error(`kokoro /dev/generate_from_phonemes HTTP ${r.status}`);
      }
      devEndpointsOk = true;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 256) throw new Error('kokoro retornou audio vazio (fonemas)');
      return buf;
    } finally {
      clearTimeout(to);
    }
  } finally {
    kkRelease();
    scheduleIdleStop();
  }
};

const synthesizeNow = async ({ text, voice, speed = 1.0, langCode = 'p' }) => {
  const body = {
    model: 'kokoro',
    input: prepText(text),
    voice,
    lang_code: langCode,
    response_format: 'wav',
    speed,
    stream: false,
    normalization_options: {
      normalize: true,
      unit_normalization: false,
      url_normalization: true,
      email_normalization: true,
      optional_pluralization_normalization: true,
    },
  };
  let lastErr;
  const ATTEMPTS = 4;
  for (let i = 0; i < ATTEMPTS; i++) {
    if (i > 0) await sleep(1500 * i); // backoff: cobre hiccup/cold-start do Kokoro
    // Timeout: sem isso, se o Kokoro pendura numa sintese o fetch fica preso pra
    // sempre (a geracao "trava" sem falhar nem completar). 60s por clip e folgado.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const r = await fetch(`${url()}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        lastErr = new Error(`kokoro HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 256) {
        lastErr = new Error('kokoro retornou audio vazio');
        continue;
      }
      return buf;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(to);
    }
  }
  throw lastErr || err('KOKORO_FAILED', 'kokoro falhou');
};
