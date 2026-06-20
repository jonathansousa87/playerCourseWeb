// Integracao com WhisperX para transcrever aulas que ainda nao tem .txt.
// Usa EXATAMENTE os mesmos parametros do DubAI (modelo, compute_type, VAD e
// thresholds), so trocando a saida para .txt no padrao da plataforma.
//
// O binario vem do .env (WHISPERX_BIN), pra rodar tanto via miniconda quanto
// via docker:
//   WHISPERX_BIN=/home/user/miniconda3/envs/whisperx/bin/whisperx
//   WHISPERX_BIN=docker exec whisperx-container whisperx
// Opcionais:
//   WHISPERX_DEVICE  = cuda | cpu   (default: auto-detecta via nvidia-smi)
//   WHISPERX_MODEL   = distil-large-v3.5 (default)
//   WHISPERX_LANGUAGE= pt (default)
//   WHISPERX_LD_LIBRARY_PATH = libs extras (so faz sentido no modo conda)
//
// OBS docker: o caminho do audio precisa estar visivel DENTRO do container
// (monte a pasta de cursos no docker-compose), senao o whisperx nao acha o
// arquivo.

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, basename, extname, join } from 'path';

// PT-BR usa large-v3-turbo (multilingue), igual ao fluxo PT-BR do DubAI.
// distil-large-v3.5 e English-only e nao serve pra portugues.
const WHISPERX_DEFAULT_MODEL = 'large-v3-turbo';
const WHISPERX_DEFAULT_LANGUAGE = 'pt';

// Roda um comando e resolve com { code, output } (stdout+stderr juntos).
const run = (cmd, args, env) =>
  new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(cmd, args, { env });
    } catch (err) {
      reject(err);
      return;
    }
    let output = '';
    const onData = (d) => { output += d.toString(); };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, output }));
  });

// Detecta GPU NVIDIA (igual ao entrypoint do DubAI: nvidia-smi disponivel).
const hasNvidiaGpu = async () => {
  try {
    const { code } = await run('nvidia-smi', [], process.env);
    return code === 0;
  } catch {
    return false;
  }
};

// cuda | cpu — respeita WHISPERX_DEVICE, senao auto-detecta.
const resolveDevice = async () => {
  const env = (process.env.WHISPERX_DEVICE || '').trim().toLowerCase();
  if (env === 'cuda' || env === 'cpu') return env;
  return (await hasNvidiaGpu()) ? 'cuda' : 'cpu';
};

// Quebra WHISPERX_BIN em [cmd, ...prefixArgs]. Ex.: "docker exec ctr whisperx".
const splitBin = (bin) => {
  const parts = bin.split(/\s+/).filter(Boolean);
  return { cmd: parts[0], prefix: parts.slice(1) };
};

// No modo conda (bin dentro de .../envs/<env>/bin/), replica o que o DubAI faz:
// poe o lib do env no LD_LIBRARY_PATH e o bin no PATH, pra as libs CUDA carregarem.
const buildEnv = (bin) => {
  const env = { ...process.env };
  const libs = [];
  const m = bin.match(/^(.*\/envs\/[^/\s]+)\/bin\//);
  if (m) {
    libs.push(`${m[1]}/lib`, '/opt/cuda/lib64', '/usr/lib');
    env.PATH = `${m[1]}/bin:${env.PATH || ''}`;
  }
  const extra = (process.env.WHISPERX_LD_LIBRARY_PATH || '').trim();
  if (extra) libs.push(extra);
  if (libs.length) {
    env.LD_LIBRARY_PATH = [...libs, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }
  return env;
};

// Flags fixas, iguais ao DubAI (so a saida vira txt).
const buildArgs = ({ audioFile, outDir, device, computeType, batchSize, model, language }) => [
  '--model', model,
  '--device', device,
  '--compute_type', computeType,
  '--batch_size', String(batchSize),
  '--output_dir', outDir,
  '--language', language,
  '--output_format', 'txt',
  '--condition_on_previous_text', 'False',
  '--vad_onset', '0.500',
  '--vad_offset', '0.363',
  '--no_speech_threshold', '0.6',
  '--logprob_threshold', '-1.0',
  '--compression_ratio_threshold', '2.4',
  audioFile,
];

const fileExists = async (p) => {
  try { await fs.access(p); return true; } catch { return false; }
};

// Transcreve UM arquivo de audio/video gerando <base>.txt na mesma pasta.
// Retorna o caminho do .txt gerado. Lanca erro (com .code) se falhar.
export const transcribeToTxt = async ({ audioFile, model, language } = {}) => {
  const bin = (process.env.WHISPERX_BIN || '').trim();
  if (!bin) {
    const err = new Error('WHISPERX_BIN nao configurada no .env');
    err.code = 'NO_WHISPERX';
    throw err;
  }

  const device = await resolveDevice();
  const outDir = dirname(audioFile);
  const usedModel = model || (process.env.WHISPERX_MODEL || '').trim() || WHISPERX_DEFAULT_MODEL;
  const lang = language || (process.env.WHISPERX_LANGUAGE || '').trim() || WHISPERX_DEFAULT_LANGUAGE;
  const expectedTxt = join(outDir, `${basename(audioFile, extname(audioFile))}.txt`);

  // float16 nao existe em CPU — la so int8. Em GPU tenta float16 e cai pra int8.
  const computeTypes = device === 'cpu' ? ['int8'] : ['float16', 'int8'];
  const batchSizes = [8, 4, 1];

  const { cmd, prefix } = splitBin(bin);
  const env = buildEnv(bin);
  let lastErr = '';

  for (const computeType of computeTypes) {
    for (const batchSize of batchSizes) {
      const args = [
        ...prefix,
        ...buildArgs({ audioFile, outDir, device, computeType, batchSize, model: usedModel, language: lang }),
      ];
      const { code, output } = await run(cmd, args, env);
      if (code === 0 && (await fileExists(expectedTxt))) {
        return expectedTxt;
      }
      lastErr = output.trim().split('\n').slice(-3).join(' ');
      const oom = /out of memory/i.test(output) && /cuda/i.test(output);
      // OOM com batch maior: tenta batch menor. Caso contrario sai do loop de
      // batch e tenta o proximo compute_type (int8 economiza memoria).
      if (!(oom && batchSize > 1)) break;
    }
  }

  const err = new Error(`WhisperX falhou para ${basename(audioFile)}: ${lastErr || 'sem saida'}`);
  err.code = 'WHISPERX_FAILED';
  throw err;
};
