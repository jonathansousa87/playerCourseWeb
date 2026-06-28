// Logica de geracao de curso de leitura, compartilhada entre o modal por-curso
// e a tela de geracao em lote (3 colunas). Recebe callbacks de progresso pra a
// UI desenhar a pipeline; nao depende de React.
import {
  generateReadingModule,
  generateReadingBatch,
  generateIa,
  generatePrequestions,
  generatePodcastScript,
  generatePodcastAudio,
} from "./progressApi";

export const MATERIAL_KINDS = [
  { key: "prequiz", label: "Pre-Quiz" },
  { key: "exemplos", label: "Pratica" },
  { key: "quiz", label: "Quiz" },
  { key: "flashcards", label: "Flashcards" },
  { key: "diario", label: "Diario" },
  { key: "podcast", label: "Podcast" },
];

// Materiais de texto que vao juntos num generateIa. Podcast e pre-quiz a parte.
export const TEXT_KINDS = new Set(["exemplos", "quiz", "flashcards", "diario"]);

export const MAT_CONCURRENCY = 3;
const VIDEO_RE = /\.(mp4|webm|ts|m3u8|mkv)$/i;

// Pool com teto de concorrencia (o backend limita a concorrencia real na API).
export const runPool = async (items, limit, worker) => {
  let i = 0;
  const run = async () => {
    while (i < items.length) await worker(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
};

// Modulos "folha" que contem aulas, preservando o path (pra numeracao estavel).
export const collectModules = (content, acc = []) => {
  for (const item of content || []) {
    if (item.type === "module") {
      const hasLessons = (item.content || []).some(
        (c) =>
          c.type === "lesson-group" ||
          (c.type === "lesson" && VIDEO_RE.test(c.title)),
      );
      if (hasLessons) acc.push({ title: item.title, path: item.path });
      collectModules(item.content, acc);
    }
  }
  return acc;
};

// Gera os materiais (IA) de UMA aula de leitura ja criada. Retorna o custo
// DeepSeek (USD) dos materiais de texto (prequiz/podcast nao reportam custo).
const runLessonMaterials = async ({ leituraTitle, prefix, kinds, model, instruction }) => {
  const instr = (instruction || "").trim();
  const text = kinds.filter((k) => TEXT_KINDS.has(k));
  let cost = 0;
  if (text.length) {
    const r = await generateIa({ courseTitle: leituraTitle, lessonPrefix: prefix, kinds: text, model, instruction: instr });
    cost += r?.cost || 0;
  }
  if (kinds.includes("prequiz")) {
    const pq = await generatePrequestions({ courseTitle: leituraTitle, lessonPrefix: prefix, model, instruction: instr });
    cost += pq?.cost || 0;
  }
  if (kinds.includes("podcast")) {
    // Concorrencia do Kokoro e controlada no backend (fila + Semaphore).
    // So o roteiro usa DeepSeek (tem custo); o audio (TTS) e local, sem custo.
    const s = await generatePodcastScript({ courseTitle: leituraTitle, lessonPrefix: prefix, model });
    cost += s?.cost || 0;
    await generatePodcastAudio({ courseTitle: leituraTitle, lessonPrefix: prefix, title: s.title, turns: s.turns, model });
  }
  return cost;
};

// Gera a leitura de UM curso. `modules` = todos os modulos do curso (pra index
// estavel); `selectedPaths` = quais gerar. `onProgress(ev)` recebe eventos:
//   { kind:'module-start', module }
//   { kind:'reading', total }                 (plano de aulas definido)
//   { kind:'reading-lesson', i, status }      ('queue'|'doing'|'ok'|'fail')
//   { kind:'materials-init', total }
//   { kind:'material', i, status }
//   { kind:'module-done', module, result }
//   { kind:'module-error', module, error }
export const generateCourseReading = async ({
  courseTitle,
  modules,
  selectedPaths,
  model,
  instruction,
  autoTranscribe,
  language,
  preCondense,
  genMaterials,
  materialKinds,
  cancelRef,
  onProgress = () => {},
}) => {
  const chosen = modules.filter((m) => selectedPaths.has(m.path));
  const results = [];
  for (const mod of chosen) {
    if (cancelRef?.current) break;
    onProgress({ kind: "module-start", module: mod.title });
    const index = modules.findIndex((m) => m.path === mod.path) + 1;

    const onModuleProgress = (ev) => {
      if (ev.type === "plano") onProgress({ kind: "reading", total: ev.total });
      else if (ev.type === "aula") {
        const status = ev.status === "start" ? "doing" : ev.ok ? "ok" : "fail";
        onProgress({ kind: "reading-lesson", i: ev.i, status });
      } else if (ev.type === "transcricao") {
        onProgress({ kind: "transcricao", status: ev.status, transcribed: ev.transcribed });
      }
    };

    try {
      const out = await generateReadingModule({
        courseTitle,
        modulePath: mod.path,
        moduleTitle: mod.title,
        index,
        model,
        instruction: (instruction || "").trim(),
        autoTranscribe,
        language,
        preCondense,
        onProgress: onModuleProgress,
      });

      let materials = null;
      const kinds = [...materialKinds];
      const lessons = (out.created || []).filter((c) => c.ok && c.prefix);
      if (genMaterials && kinds.length && lessons.length) {
        const leituraTitle = `${courseTitle} - Leitura`;
        onProgress({ kind: "materials-init", total: lessons.length });
        materials = { ok: 0, fail: 0, total: lessons.length, errors: [] };
        await runPool(lessons.map((l, i) => ({ l, i })), MAT_CONCURRENCY, async ({ l, i }) => {
          if (cancelRef?.current) return;
          onProgress({ kind: "material", i, status: "doing" });
          try {
            await runLessonMaterials({ leituraTitle, prefix: l.prefix, kinds, model, instruction });
            materials.ok += 1;
            onProgress({ kind: "material", i, status: "ok" });
          } catch (err) {
            materials.fail += 1;
            materials.errors.push(`${l.prefix}: ${err.message}`);
            onProgress({ kind: "material", i, status: "fail" });
          }
        });
      }

      const result = { module: mod.title, ...out, materials };
      results.push(result);
      onProgress({ kind: "module-done", module: mod.title, result });
    } catch (err) {
      results.push({ module: mod.title, error: err.message });
      onProgress({ kind: "module-error", module: mod.title, error: err.message });
    }
  }
  return results;
};

// Geracao EM LOTE de TODOS os cursos/modulos selecionados, com revezamento de
// VRAM no backend (WhisperX -> Qwen -> DeepSeek, nessa ordem, limpando a GPU
// entre as fases). Depois da leitura, gera os materiais (DeepSeek, sem VRAM).
// Eventos de progresso (onProgress) sempre carregam { courseTitle, modulePath }:
//   { kind:'phase', phase:'whisper'|'qwen'|'deepseek'|'materials'|'done', status }
//   { kind:'module-transcribe'|'module-precondense', courseTitle, modulePath, status }
//   { kind:'module-start' } / { kind:'reading', total } / { kind:'reading-lesson', status }
//   { kind:'module-done', result } / { kind:'module-error', error }
//   { kind:'materials-init', total } / { kind:'material', i, status } / { kind:'materials-errors', errors }
export const generateReadingCourseBatch = async ({
  courses,
  modulesByCourse,
  selectedModules,
  model,
  instruction,
  autoTranscribe,
  language,
  preCondense,
  genMaterials,
  materialKinds,
  cancelRef,
  signal,
  onProgress = () => {},
}) => {
  // jobs com index estavel (posicao do modulo na lista do curso + 1).
  const jobs = [];
  for (const c of courses) {
    const all = modulesByCourse[c.title] || [];
    const sel = selectedModules[c.title] || new Set();
    all.forEach((m, i) => {
      if (sel.has(m.path)) jobs.push({ courseTitle: c.title, modulePath: m.path, moduleTitle: m.title, index: i + 1 });
    });
  }
  if (jobs.length === 0) return [];

  const instr = (instruction || "").trim();

  // ---- Leitura (as 3 fases de GPU acontecem no backend) ----
  const results = await generateReadingBatch({
    jobs,
    model,
    instruction: instr,
    autoTranscribe,
    language,
    preCondense,
    signal,
    onProgress: (ev) => {
      const tag = { courseTitle: ev.courseTitle, modulePath: ev.modulePath };
      switch (ev.type) {
        case "phase": onProgress({ kind: "phase", phase: ev.phase, status: ev.status }); break;
        case "transcricao": onProgress({ kind: "module-transcribe", ...tag, status: ev.status, transcribed: ev.transcribed }); break;
        case "precondense": onProgress({ kind: "module-precondense", ...tag, status: ev.status }); break;
        case "module-start": onProgress({ kind: "module-start", ...tag }); break;
        case "plano": onProgress({ kind: "reading", ...tag, total: ev.total }); break;
        case "aula": onProgress({ kind: "reading-lesson", ...tag, status: ev.status === "start" ? "doing" : ev.ok ? "ok" : "fail" }); break;
        case "module-result": onProgress({ kind: "module-done", ...tag, result: ev.result }); break;
        case "module-error": onProgress({ kind: "module-error", ...tag, error: ev.error }); break;
        default: break;
      }
    },
  });

  // ---- Materiais (DeepSeek, remoto, sem VRAM) — "segue como ja e" ----
  const kinds = [...(materialKinds || [])];
  if (genMaterials && kinds.length) {
    onProgress({ kind: "phase", phase: "materials", status: "start" });
    for (const r of results) {
      if (cancelRef?.current) break;
      if (r.error) continue;
      const lessons = (r.created || []).filter((c) => c.ok && c.prefix);
      if (!lessons.length) continue;
      const leituraTitle = `${r.courseTitle} - Leitura`;
      const tag = { courseTitle: r.courseTitle, modulePath: r.modulePath };
      onProgress({ kind: "materials-init", ...tag, total: lessons.length });
      const errors = [];
      let materialsCost = 0;
      await runPool(lessons.map((l, i) => ({ l, i })), MAT_CONCURRENCY, async ({ l, i }) => {
        if (cancelRef?.current) return;
        onProgress({ kind: "material", ...tag, i, status: "doing" });
        try {
          materialsCost += await runLessonMaterials({ leituraTitle, prefix: l.prefix, kinds, model, instruction: instr });
          onProgress({ kind: "material", ...tag, i, status: "ok" });
        } catch (err) {
          errors.push(`${l.prefix}: ${err.message}`);
          onProgress({ kind: "material", ...tag, i, status: "fail" });
        }
      });
      onProgress({ kind: "module-cost", ...tag, materialsCost });
      if (errors.length) onProgress({ kind: "materials-errors", ...tag, errors });
    }
    onProgress({ kind: "phase", phase: "materials", status: "done" });
  }

  onProgress({ kind: "phase", phase: "done", status: "start" });
  return results;
};
