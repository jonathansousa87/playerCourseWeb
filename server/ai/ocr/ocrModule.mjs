// Orquestrador do pipeline OCR para UM vídeo de aula.
//
// O3 — orquestração robusta:
// - keyframes (PySceneDetect pref + ffmpeg fallback, dedup perceptual)
// - PaddleOCR (CPU, batch mode) → vocabulário canônico
// - Qwen3-VL (GPU, diagrama + texto complementar) → Mermaid fiel + vocabulário
// - Retries: se PaddleOCR falha num batch, tenta frame a frame (dentro do paddle).
//   Se o VL falha num frame, loga e segue (não derruba o vídeo inteiro).
// - Cache por vídeo: roda 1× e reusa. Se metade falha, cacheia o que conseguiu.
//
// SEMPRE roda PaddleOCR e depois o VL em todos os frames (decisão do usuário:
// extrair o máximo possível). O VL pega o texto que o Paddle perdeu + a
// estrutura dos diagramas.
//
// Revezamento de VRAM: PaddleOCR no CPU (fora da briga); VL na GPU, derrubando
// o Qwen texto antes e depois.
//
// Flags .env:
//   OCR_TEXT_ENABLED=1     — liga o OCR de texto/código (PaddleOCR + VL-OCR)
//   OCR_DIAGRAM_ENABLED=1  — liga o VL de diagrama (exige GPU)
//
// Degrada gracioso: se PaddleOCR/VL indisponível, devolve vazios (a F1
// heurística segue como fallback).

import { extractKeyframes, cleanupKeyframes } from './keyframes.mjs';
import { runPaddleOcr } from './paddle.mjs';
import { extractDiagrams } from './extractDiagram.mjs';
import { extractVocabulary } from './extractVocabulary.mjs';
import { getOcrCache, setOcrCache } from './ocrStore.mjs';
import { startVl, stopVl } from './visionServer.mjs';

const truthy = (v) => /^(1|true|yes|on)$/i.test((v || '').trim());

export const ocrTextEnabled = () => truthy(process.env.OCR_TEXT_ENABLED);
export const ocrDiagramEnabled = () => truthy(process.env.OCR_DIAGRAM_ENABLED);

// Retry wrapper: tenta N vezes com backoff exponencial. Só pra chamadas
// transient (VL can timeout em frames grandes). PaddleOCR já tem retry interno.
const retry = async (fn, attempts = 2, delayMs = 2000) => {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) { lastErr = err; if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1))); }
  }
  throw lastErr;
};

// Funde vocabulários (Paddle + VL), dedup case-insensitive, prefere versão
// com mais maiúsculas (caminho original do OCR da tela).
const mergeVocab = (paddleVocab, vlVocab) => {
  const merged = new Map();
  const addTok = (tok) => {
    if (!tok || tok.length < 2) return;
    const lower = tok.toLowerCase();
    const existing = merged.get(lower);
    if (existing) {
      const capsExisting = (existing.match(/[A-Z]/g) || []).length;
      const capsNew = (tok.match(/[A-Z]/g) || []).length;
      if (capsNew > capsExisting) merged.set(lower, tok);
    } else {
      merged.set(lower, tok);
    }
  };
  for (const v of paddleVocab || []) addTok(v);
  for (const v of vlVocab || []) addTok(v);
  return [...merged.values()];
};

// Processa UM vídeo: extrai keyframes, roda PaddleOCR + VL, monta vocabulário
// + diagramas, cacheia. Retorna { vocabulary, diagrams, frames }.
// Se já tem cache, devolve direto (sem GPU/CPU).
export const processVideoOcr = async ({ videoPath, coursesPath, log = () => {} } = {}) => {
  if (!videoPath) return { vocabulary: [], diagrams: [], frames: 0, cached: false };

  // Cache primeiro
  const cached = await getOcrCache(coursesPath, videoPath);
  if (cached?.vocabulary?.length || cached?.diagrams?.length) {
    log(`[ocr] cache hit: ${videoPath.split('/').pop()} (${cached.vocabulary?.length || 0} tokens, ${cached.diagrams?.length || 0} diagramas)`);
    return { ...cached, cached: true };
  }

  // Extrai keyframes
  const { dir, frames } = await extractKeyframes({ videoPath, log });
  if (!frames.length) {
    log(`[ocr] sem keyframes extraídos de ${videoPath.split('/').pop()}`);
    return { vocabulary: [], diagrams: [], frames: 0, cached: false };
  }

  let vocabulary = [];
  let diagrams = [];
  const diagramEnabled = ocrDiagramEnabled();
  const textEnabled = ocrTextEnabled();

  try {
    // 1. PaddleOCR (CPU) em todos os frames — texto/código exato
    if (textEnabled) {
      log(`[ocr] PaddleOCR em ${frames.length} frames (batch)...`);
      const t0 = Date.now();
      const paddleResults = await runPaddleOcr({ frames, log });
      vocabulary = extractVocabulary(paddleResults);
      const errors = paddleResults.filter((r) => r.error).length;
      log(`[ocr] PaddleOCR: ${vocabulary.length} tokens em ${((Date.now() - t0) / 1000).toFixed(0)}s${errors ? ` (${errors} erros)` : ''}`);
    } else {
      log('[ocr] PaddleOCR desligado (OCR_TEXT_ENABLED=0)');
    }

    // 2. Qwen3-VL em todos os frames — texto complementar + diagramas
    // Usuário pediu: sempre rodar ambos para extrair o máximo.
    if (diagramEnabled || textEnabled) {
      let vlStarted = false;
      try {
        log('[ocr] subindo Qwen3-VL...');
        await retry(() => startVl({ log }), 2);
        vlStarted = true;
      } catch (err) {
        log(`[ocr] VL não subiu: ${err.message}; seguindo só com PaddleOCR`);
      }

      if (vlStarted) {
        try {
          log(`[ocr] Qwen3-VL em ${frames.length} frames...`);
          const t0 = Date.now();
          const vlResult = await extractDiagrams({ frames, log });
          vocabulary = mergeVocab(vocabulary, vlResult.vocab);
          diagrams = vlResult.mermaid;
          log(`[ocr] Qwen3-VL: ${diagrams.length} diagramas, +${vlResult.vocab.length} tokens em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        } finally {
          // Derruba o VL pra liberar VRAM (o Qwen texto volta na pre-condensação)
          try { await stopVl({ log: () => {} }); } catch {}
        }
      }
    }
  } finally {
    // Limpa os keyframes (dir temporário)
    await cleanupKeyframes({ dir });
  }

  // Grava no cache (mesmo parcial — se metade falhou, cacheia o que conseguiu)
  const result = { vocabulary, diagrams, frames: frames.length };
  if (vocabulary.length || diagrams.length) {
    await setOcrCache(coursesPath, videoPath, result);
  }

  log(`[ocr] ${videoPath.split('/').pop()}: ${vocabulary.length} tokens, ${diagrams.length} diagramas`);
  return { ...result, cached: false };
};
