// PaddleOCR (PP-OCRv6) — extrai TEXTO/CÓDIGO exato dos keyframes.
//
// O3 — batch mode: o PaddleOCR 3.x suporta `predict()` com uma LISTA de imagens
// (batch interno). Em vez de 1 chamada por frame, mandamos todas de uma vez
// (ou em batches de BATCH_SIZE) — muito mais rápido (1 carregamento do modelo,
// inferência em lote). O modelo só carrega UMA vez (antes do loop).
//
// Roda no env conda `paddleocr` (python 3.11) via child_process. CPU
// (enable_mkldnn=False — bug oneDNN no PaddlePaddle 3.3). Não disputa VRAM.
//
// Config via .env:
//   PADDLE_PYTHON   = caminho do python do env conda
//   PADDLE_LANG     = ch | en | fr | ... (default: ch — PP-OCRv6 multilatino)
//   PADDLE_BATCH    = tamanho do batch (default: 8)

import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const DEFAULT_PYTHON =
  (process.env.PADDLE_PYTHON || '').trim() ||
  `${process.env.HOME}/miniconda3/envs/paddleocr/bin/python`;

const LANG = (process.env.PADDLE_LANG || 'ch').trim();
const BATCH_SIZE = Math.max(1, parseInt(process.env.PADDLE_BATCH || '8', 10));
const TIMEOUT_PER_BATCH = 240_000; // 4 min por batch (o 1º baixa modelos)

// Script python: carrega PaddleOCR UMA vez, lê batches de caminhos do stdin
// (um batch por linha, separados por `|`), processa em lote, imprime JSON por
// frame em stdout. Suporta retries: se um batch falha, repassa frame a frame.
const SCRIPT = `
import sys, json, os
os.environ['FLAGS_use_mkldnn'] = '0'
from paddleocr import PaddleOCR
ocr = PaddleOCR(lang='${LANG}', use_doc_orientation_classify=False, use_doc_unwarping=False, enable_mkldnn=False)

def ocr_one(path):
    try:
        result = ocr.predict(path)
        texts = []
        if result and isinstance(result, list) and len(result) > 0:
            r0 = result[0]
            if isinstance(r0, dict) and 'rec_texts' in r0:
                texts = r0['rec_texts'] or []
            elif isinstance(r0, list):
                for item in r0:
                    if isinstance(item, (list, tuple)) and len(item) >= 2:
                        texts.append(str(item[1]))
        return {'file': os.path.basename(path), 'texts': texts}
    except Exception as e:
        return {'file': os.path.basename(path), 'error': str(e)}

for line in sys.stdin:
    paths = [p.strip() for p in line.strip().split('|') if p.strip()]
    if not paths: continue
    # Tenta batch primeiro
    try:
        results = ocr.predict(paths)
        for i, r in enumerate(results):
            texts = []
            if r and isinstance(r, dict) and 'rec_texts' in r:
                texts = r['rec_texts'] or []
            elif r and isinstance(r, list):
                for item in r:
                    if isinstance(item, (list, tuple)) and len(item) >= 2:
                        texts.append(str(item[1]))
            print(json.dumps({'file': os.path.basename(paths[i]), 'texts': texts}, ensure_ascii=False))
    except Exception as e:
        # Batch falhou: processa um a um (retry)
        for p in paths:
            r = ocr_one(p)
            print(json.dumps(r, ensure_ascii=False))
sys.stdout.flush()
`;

// Roda PaddleOCR numa lista de frames. Retorna [{ file, texts: [str], error? }].
export const runPaddleOcr = async ({ frames = [], log = () => {} } = {}) => {
  if (!frames.length) return [];

  let python = DEFAULT_PYTHON;
  try { await fs.access(python); } catch {
    python = 'python3';
    const chk = await spawn('python3', ['-c', 'import paddleocr'], { stdio: 'pipe' });
    await new Promise((res) => chk.on('close', res));
    if (chk.exitCode !== 0) {
      log('[paddle] env conda paddleocr nao encontrado nem paddleocr no python3');
      return frames.map((f) => ({ file: f.split('/').pop(), error: 'paddleocr nao disponivel' }));
    }
  }

  // Env do conda (PATH + LD_LIBRARY_PATH)
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

  // Envia os frames em batches (separados por `|`, um batch por linha)
  for (let i = 0; i < frames.length; i += BATCH_SIZE) {
    const batch = frames.slice(i, i + BATCH_SIZE);
    proc.stdin.write(batch.join('|') + '\n');
  }
  proc.stdin.end();

  const totalBatches = Math.ceil(frames.length / BATCH_SIZE);
  const timer = setTimeout(() => {
    try { proc.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
  }, TIMEOUT_PER_BATCH * Math.max(1, totalBatches));

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
