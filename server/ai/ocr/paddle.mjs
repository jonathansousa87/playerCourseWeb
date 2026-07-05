// PaddleOCR (PP-OCRv6) — extrai TEXTO/CÓDIGO exato dos keyframes.
//
// Roda no env conda `paddleocr` (python 3.11) via child_process. CPU
// (FLAGS_use_mkldnn=0 — bug oneDNN). Nao disputa VRAM com WhisperX/Qwen/Kokoro.
//
// Retorna linhas de texto bruto de cada frame. O chamador agrega num
// vocabulário canônico (extractVocabulary.mjs).
//
// Config via .env:
//   PADDLE_PYTHON  = caminho do python do env conda (default: tenta ~/miniconda3/envs/paddleocr/bin/python)
//   PADDLE_LANG    = ch | en | fr | ... (default: ch — PP-OCRv6 multilatino; portugues incluido)
//   PADDLE_USE_GPU = 0 (default; CPU. GPU disputaria VRAM)

import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const truthy = (v) => /^(1|true|yes|on)$/i.test((v || '').trim());

const DEFAULT_PYTHON =
  (process.env.PADDLE_PYTHON || '').trim() ||
  `${process.env.HOME}/miniconda3/envs/paddleocr/bin/python`;

const LANG = (process.env.PADDLE_LANG || 'ch').trim(); // 'ch' = multilatino (inclui PT)
const USE_GPU = truthy(process.env.PADDLE_USE_GPU);
const TIMEOUT_PER_FRAME = 180_000; // 3 min por frame — o primeiro baixa modelos (cache depois)

// Script python embarcado: carrega PaddleOCR UMA vez, processa N frames
// passados por stdin (caminhos), imprime JSON por frame em stdout.
const SCRIPT = `
import sys, json, os
os.environ['FLAGS_use_mkldnn'] = '0'
from paddleocr import PaddleOCR
ocr = PaddleOCR(lang='${LANG}', use_doc_orientation_classify=False, use_doc_unwarping=False, enable_mkldnn=False)
for line in sys.stdin:
    path = line.strip()
    if not path: continue
    try:
        result = ocr.predict(path)
        texts = []
        # PaddleOCR 3.x: result[0] -> dict com 'rec_texts'
        if result and isinstance(result, list) and len(result) > 0:
            r0 = result[0]
            if isinstance(r0, dict) and 'rec_texts' in r0:
                texts = r0['rec_texts'] or []
            elif isinstance(r0, list):
                # formato antigo: [[box, text, conf], ...]
                for item in r0:
                    if isinstance(item, (list, tuple)) and len(item) >= 2:
                        texts.append(str(item[1]))
        print(json.dumps({'file': os.path.basename(path), 'texts': texts}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'file': os.path.basename(path), 'error': str(e)}, ensure_ascii=False))
sys.stdout.flush()
`;

// Roda PaddleOCR numa lista de frames. Retorna [{ file, texts: [str], error? }].
export const runPaddleOcr = async ({ frames = [], log = () => {} } = {}) => {
  if (!frames.length) return [];

  let python = DEFAULT_PYTHON;
  // Verifica se o python existe; se nao, tenta 'python3' (talvez o env esteja
  // no PATH ativo).
  try { await fs.access(python); } catch {
    python = 'python3';
    // Verifica se tem paddleocr instalado no python3
    const chk = await spawn('python3', ['-c', 'import paddleocr'], { stdio: 'pipe' });
    await new Promise((res) => chk.on('close', res));
    if (chk.exitCode !== 0) {
      log('[paddle] env conda paddleocr nao encontrado nem paddleocr no python3');
      return frames.map((f) => ({ file: f.split('/').pop(), error: 'paddleocr nao disponivel' }));
    }
  }

  // Garante que o env do conda esta completo (PATH, LD_LIBRARY_PATH do env).
  const env = { ...process.env };
  const envDir = python.replace(/\/bin\/python$/, '');
  if (envDir !== python) {
    env.PATH = `${envDir}/bin:${env.PATH || ''}`;
    env.LD_LIBRARY_PATH = [`${envDir}/lib`, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }

  const proc = spawn(python, ['-c', SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'], env });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (d) => { stdout += d.toString(); });
  proc.stderr.on('data', (d) => { stderr += d.toString(); });

  // Envia os caminhos dos frames
  proc.stdin.write(frames.join('\n') + '\n');
  proc.stdin.end();

  // Timeout
  const timer = setTimeout(() => {
    try { proc.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
  }, TIMEOUT_PER_FRAME * Math.max(1, frames.length));

  try {
    await new Promise((resolve, reject) => {
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`PaddleOCR exit ${code}: ${stderr.slice(-500)}`));
      });
    });
  } catch (err) {
    log(`[paddle] falhou: ${err.message}`);
    return frames.map((f) => ({ file: f.split('/').pop(), error: err.message }));
  } finally {
    clearTimeout(timer);
  }

  // Parse JSON por linha
  const results = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {
      /* linha incompleta — ignora */
    }
  }
  if (stderr && results.length < frames.length) {
    log(`[paddle] stderr (pode ser normal): ${stderr.slice(0, 300)}`);
  }
  return results;
};
