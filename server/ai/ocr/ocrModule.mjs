// Orquestrador do pipeline OCR para UM vídeo de aula.
// Junt keyframes -> PaddleOCR (CPU, texto/código) -> Qwen3-VL (GPU, diagrama
// + texto complementar) -> vocabulário canônico + diagramas Mermaid.
//
// SEMPRE roda PaddleOCR e depois o VL em todos os frames (decisão do usuário:
// extrair o máximo possível). O VL pega o texto que o Paddle perdeu + a
// estrutura dos diagramas.
//
// Cache por vídeo (ocrStore): OCR roda 1× por vídeo e reusa. Revelamento de
// VRAM: PaddleOCR no CPU (fora da briga); VL na GPU, derrubando o Qwen texto
// antes e depois (igual o WhisperX faz).
//
// Flags .env:
//   OCR_TEXT_ENABLED=1     — liga o OCR de texto/código (PaddleOCR + VL-OCR)
//   OCR_DIAGRAM_ENABLED=1  — liga o VL de diagrama (exige GPU)
//
// Degrada gracioso: se PaddleOCR/VL indisponível, devolve vazios (a F1 heurística
// segue como fallback).

import { extractKeyframes, cleanupKeyframes } from './keyframes.mjs';
import { runPaddleOcr } from './paddle.mjs';
import { extractDiagrams } from './extractDiagram.mjs';
import { extractVocabulary } from './extractVocabulary.mjs';
import { getOcrCache, setOcrCache } from './ocrStore.mjs';
import { startVl, stopVl, isVlUp } from './visionServer.mjs';

const truthy = (v) => /^(1|true|yes|on)$/i.test((v || '').trim());

export const ocrTextEnabled = () => truthy(process.env.OCR_TEXT_ENABLED);
export const ocrDiagramEnabled = () => truthy(process.env.OCR_DIAGRAM_ENABLED);

// Processa UM vídeo: extrai keyframes, roda PaddleOCR + VL, monta vocabulário
// + diagramas, cacheia. Retorna { vocabulary, diagrams, frames }.
// Se já tem cache, devolve direto (sem GPU/CPU).
export const processVideoOcr = async ({ videoPath, coursesPath, log = () => {} } = {}) => {
  if (!videoPath) return { vocabulary: [], diagrams: [], frames: 0, cached: false };

  // Cache primeiro
  const cached = await getOcrCache(coursesPath, videoPath);
  if (cached) {
    log(`[ocr] cache hit: ${videoPath.split('/').pop()} (${cached.vocabulary?.length || 0} tokens)`);
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
    // 1. PaddleOCR (CPU) em todos os frames — sempre (texto/código exato)
    if (textEnabled) {
      log(`[ocr] PaddleOCR em ${frames.length} frames...`);
      const paddleResults = await runPaddleOcr({ frames, log });
      vocabulary = extractVocabulary(paddleResults);
      log(`[ocr] PaddleOCR: ${vocabulary.length} tokens de vocabulário`);
    } else {
      log('[ocr] PaddleOCR desligado (OCR_TEXT_ENABLED=0)');
    }

    // 2. Qwen3-VL em todos os frames — sempre (texto complementar + diagramas)
    // Usuário pediu: sempre rodar ambos para extrair o máximo.
    if (diagramEnabled || textEnabled) {
      // Sobe o VL (derruba o Qwen texto + Kokoro pra liberar VRAM)
      let vlStarted = false;
      try {
        await startVl({ log });
        vlStarted = true;
      } catch (err) {
        log(`[ocr] VL não subiu: ${err.message}; seguindo só com PaddleOCR`);
      }

      if (vlStarted) {
        try {
          log(`[ocr] Qwen3-VL em ${frames.length} frames...`);
          const vlResult = await extractDiagrams({ frames, log });
          // Funde vocabulário: Paddle (exato p/ código) + VL (texto complementar + labels de diagrama)
          // Dedup case-insensitive, prefere a versão com mais maiúsculas.
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
          for (const v of vocabulary) addTok(v);
          for (const v of vlResult.vocab) addTok(v);
          vocabulary = [...merged.values()];
          diagrams = vlResult.mermaid;
        } finally {
          // Derruba o VL pra liberar VRAM (o Qwen texto volta na fase de pre-condensação)
          try { await stopVl({ log: () => {} }); } catch {}
        }
      }
    }
  } finally {
    // Limpa os keyframes (dir temporário)
    await cleanupKeyframes({ dir });
  }

  // Grava no cache
  const result = { vocabulary, diagrams, frames: frames.length };
  await setOcrCache(coursesPath, videoPath, result);

  log(`[ocr] ${videoPath.split('/').pop()}: ${vocabulary.length} tokens, ${diagrams.length} diagramas`);
  return { ...result, cached: false };
};
