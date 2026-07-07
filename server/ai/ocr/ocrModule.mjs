// Orquestrador do pipeline OCR para UM vídeo de aula.
//
// O3 — orquestração robusta:
// - keyframes (PySceneDetect pref + ffmpeg fallback, dedup perceptual)
// - PaddleOCR (GPU, batch mode) → vocabulário canônico
// - Qwen3-VL (GPU, diagrama + texto complementar) → Mermaid fiel + vocabulário
// - Retries: se PaddleOCR falha num batch, tenta frame a frame (dentro do paddle).
//   Se o VL falha num frame, loga e segue (não derruba o vídeo inteiro).
// - Cache por vídeo: roda 1× e reusa. Se metade falha, cacheia o que conseguiu.
//
// SEMPRE roda PaddleOCR e depois o VL em todos os frames (decisão do usuário:
// extrair o máximo possível). O VL pega o texto que o Paddle perdeu + a
// estrutura dos diagramas.
//
// Revezamento de VRAM: PaddleOCR na GPU como processos efêmeros (libera a VRAM
// ao sair, antes do VL subir); VL na GPU, derrubando o Qwen texto antes e depois.
//
// Flags .env:
//   OCR_TEXT_ENABLED=1     — liga o PaddleOCR (texto/código, GPU, rápido)
//   OCR_DIAGRAM_ENABLED=1  — liga o Qwen3-VL (diagramas, 8B, caro/lento; só p/
//                            cursos com diagramas de verdade — em curso de código
//                            agrega pouco e é o gargalo)
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

    // 2. Qwen3-VL em todos os frames — SO se o diagrama estiver ligado (o VL e
    // caro e, em curso de codigo, agrega pouco sobre o PaddleOCR). O1 = so Paddle.
    if (diagramEnabled) {
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

// Processa o OCR de UM MÓDULO INTEIRO em DUAS FASES, pra NÃO subir/derrubar o
// Qwen3-VL uma vez por vídeo (o boot do 8B na VRAM é caro):
//   FASE 1 — PaddleOCR (GPU, PADDLE_DEVICE=gpu) em TODOS os vídeos pendentes.
//            Roda como processos efêmeros (sobe, faz o vídeo, sai — libera a
//            VRAM), guardando os keyframes de cada vídeo em disco pra fase 2.
//   FASE 2 — sobe o Qwen3-VL UMA vez e passa por TODOS os frames de TODOS os
//            vídeos; derruba o VL no fim (boot do 8B na VRAM 1×, não N×).
// Como as fases são sequenciais e o Paddle sai antes da fase 2, não há disputa
// de VRAM entre o PaddleOCR e o VL.
// Cache continua por vídeo: os já cacheados nem entram nas fases. Retorna uma
// lista [{ videoPath, vocabulary, diagrams, frames, cached }] (o chamador agrega).
export const processModuleOcr = async ({ videos = [], coursesPath, log = () => {}, onProgress = () => {} } = {}) => {
  const results = [];
  const diagramEnabled = ocrDiagramEnabled();
  const textEnabled = ocrTextEnabled();
  if (!videos.length || (!diagramEnabled && !textEnabled)) return results;

  // 0. Separa cacheados (devolve direto) dos pendentes (entram nas 2 fases).
  const pending = [];
  for (const videoPath of videos) {
    const cached = await getOcrCache(coursesPath, videoPath);
    if (cached?.vocabulary?.length || cached?.diagrams?.length) {
      log(`[ocr] cache hit: ${videoPath.split('/').pop()} (${cached.vocabulary?.length || 0} tokens, ${cached.diagrams?.length || 0} diagramas)`);
      results.push({ videoPath, ...cached, cached: true });
    } else {
      pending.push({ videoPath, dir: null, frames: [], vocabulary: [], diagrams: [] });
    }
  }
  if (!pending.length) return results;

  const total = pending.length;

  try {
    // ===== FASE 1a: keyframes de TODOS os vídeos pendentes (ffmpeg, sem VRAM) =====
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      const name = p.videoPath.split('/').pop();
      onProgress({ video: name, index: i + 1, total, phase: 'keyframes' });
      const { dir, frames } = await extractKeyframes({ videoPath: p.videoPath, log });
      p.dir = dir;
      p.frames = frames;
      if (!frames.length) log(`[ocr] sem keyframes de ${name}`);
    }

    // ===== FASE 1b: PaddleOCR UMA vez em TODOS os frames do módulo =====
    // 1 spawn de python + 1 load do modelo (em vez de 1 por vídeo). Reagrupa os
    // resultados por vídeo pelo CAMINHO COMPLETO do frame (os basenames colidem
    // entre vídeos: cada um tem kf_001.png). Depois extrai o vocabulário por vídeo
    // (o cache é por vídeo).
    if (textEnabled) {
      const frameToVideo = new Map(); // caminho do frame -> vídeo
      const allFrames = [];
      for (const p of pending) {
        for (const f of p.frames) { frameToVideo.set(f, p); allFrames.push(f); }
      }
      if (allFrames.length) {
        onProgress({ video: `${allFrames.length} frames`, index: total, total, phase: 'paddle' });
        const t0 = Date.now();
        const paddleResults = await runPaddleOcr({ frames: allFrames, log });
        const perVideo = new Map(); // vídeo -> [resultados]
        for (const r of paddleResults) {
          const p = frameToVideo.get(r.path);
          if (!p) continue;
          if (!perVideo.has(p)) perVideo.set(p, []);
          perVideo.get(p).push(r);
        }
        for (const p of pending) p.vocabulary = extractVocabulary(perVideo.get(p) || []);
        const errors = paddleResults.filter((r) => r.error).length;
        log(`[ocr] PaddleOCR (módulo): ${allFrames.length} frames em ${((Date.now() - t0) / 1000).toFixed(0)}s${errors ? ` (${errors} erros)` : ''}`);
      }
    }

    // ===== FASE 2: Qwen3-VL (GPU) — sobe UMA vez, passa por TODOS =====
    // Roda SO se o diagrama estiver ligado. O VL e a parte cara (8B, ~10GB RAM,
    // lento) e em curso de codigo produz quase so diagramas alucinados de telas
    // de navegador/UI; o "texto complementar" dele e redundante com o PaddleOCR.
    // Entao O1 (texto) sozinho = so PaddleOCR (rapido); O2 (diagrama) = liga o VL.
    const anyFrames = pending.some((p) => p.frames.length);
    if (diagramEnabled && anyFrames) {
      let vlStarted = false;
      try {
        log('[ocr] subindo Qwen3-VL (1× para o módulo)...');
        await retry(() => startVl({ log }), 2);
        vlStarted = true;
      } catch (err) {
        log(`[ocr] VL não subiu: ${err.message}; seguindo só com PaddleOCR`);
      }
      if (vlStarted) {
        try {
          for (let i = 0; i < pending.length; i++) {
            const p = pending[i];
            if (!p.frames.length) continue;
            const name = p.videoPath.split('/').pop();
            onProgress({ video: name, index: i + 1, total, phase: 'vl' });
            try {
              const t0 = Date.now();
              const vlResult = await extractDiagrams({ frames: p.frames, log });
              p.vocabulary = mergeVocab(p.vocabulary, vlResult.vocab);
              p.diagrams = vlResult.mermaid;
              log(`[ocr] Qwen3-VL ${name}: ${p.diagrams.length} diagramas, +${vlResult.vocab.length} tokens em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
            } catch (err) {
              log(`[ocr] VL falhou em ${name}: ${err.message}; segue`);
            }
          }
        } finally {
          try { await stopVl({ log: () => {} }); } catch {}
        }
      }
    }
  } finally {
    // Grava cache (mesmo parcial) e limpa os keyframes de cada vídeo pendente.
    for (const p of pending) {
      const result = { vocabulary: p.vocabulary, diagrams: p.diagrams, frames: p.frames.length };
      if (p.vocabulary.length || p.diagrams.length) {
        try { await setOcrCache(coursesPath, p.videoPath, result); } catch {}
      }
      if (p.dir) { try { await cleanupKeyframes({ dir: p.dir }); } catch {} }
      results.push({ videoPath: p.videoPath, ...result, cached: false });
    }
  }

  return results;
};
