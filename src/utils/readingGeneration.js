// Logica de geracao de curso de leitura, compartilhada entre o modal por-curso
// e a tela de geracao em lote (3 colunas). Recebe callbacks de progresso pra a
// UI desenhar a pipeline; nao depende de React.
import {
  generateReadingModule,
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

// Gera os materiais (IA) de UMA aula de leitura ja criada.
const runLessonMaterials = async ({ leituraTitle, prefix, kinds, model, instruction }) => {
  const instr = (instruction || "").trim();
  const text = kinds.filter((k) => TEXT_KINDS.has(k));
  if (text.length) {
    await generateIa({ courseTitle: leituraTitle, lessonPrefix: prefix, kinds: text, model, instruction: instr });
  }
  if (kinds.includes("prequiz")) {
    await generatePrequestions({ courseTitle: leituraTitle, lessonPrefix: prefix, model, instruction: instr });
  }
  if (kinds.includes("podcast")) {
    // Concorrencia do Kokoro e controlada no backend (fila + Semaphore).
    const s = await generatePodcastScript({ courseTitle: leituraTitle, lessonPrefix: prefix, model });
    await generatePodcastAudio({ courseTitle: leituraTitle, lessonPrefix: prefix, title: s.title, turns: s.turns, model });
  }
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
