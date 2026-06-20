import React, { useMemo, useState, useRef } from "react";
import { X, BookOpenText, Loader2, Check, AlertTriangle } from "lucide-react";
import {
  generateReadingModule,
  generateIa,
  generatePrequestions,
  generatePodcastScript,
  generatePodcastAudio,
} from "../utils/progressApi";

// Materiais que podem ser gerados automaticamente apos a leitura. O "resumo"
// NAO entra: a propria leitura ja e' o resumo (sobrescrever pela versao fraca
// seria perda). 'exemplos' = Pratica.
const MATERIAL_KINDS = [
  { key: "prequiz", label: "Pre-Quiz" },
  { key: "exemplos", label: "Pratica" },
  { key: "quiz", label: "Quiz" },
  { key: "flashcards", label: "Flashcards" },
  { key: "piada", label: "Piada" },
  { key: "diario", label: "Diario" },
  { key: "podcast", label: "Podcast" },
];
const TEXT_KINDS = new Set(["exemplos", "quiz", "piada", "flashcards", "diario"]);

// Concorrencia da fase de materiais (varias aulas ao mesmo tempo). O backend
// (semaforo do DeepSeek) limita a concorrencia real na API.
const MAT_CONCURRENCY = 3;
const runPool = async (items, limit, worker) => {
  let i = 0;
  const run = async () => { while (i < items.length) await worker(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
};

// Bolinha de status de uma aula na pipeline (mostra o paralelismo: varias
// "doing" pulsando ao mesmo tempo).
const DOT = {
  queue: "bg-slate-700",
  doing: "bg-blue-400 animate-pulse",
  ok: "bg-emerald-500",
  fail: "bg-red-500",
};
const Dots = ({ states }) => (
  <div className="flex flex-wrap gap-1 mt-1">
    {states.map((s, i) => (
      <span key={i} className={`w-2.5 h-2.5 rounded-sm ${DOT[s] || DOT.queue}`} />
    ))}
  </div>
);

// Prompt padrao do campo "Instrucao extra": modernizar pra o estado da arte do
// ANO ATUAL (pego do sistema), mesmo que o curso use versoes antigas. O usuario
// pode editar ou limpar antes de gerar.
const DEFAULT_INSTRUCTION =
  `Modernize o conteudo e os exemplos para as versoes e tecnologias mais atuais ` +
  `disponiveis em ${new Date().getFullYear()} (linguagem, frameworks, bibliotecas, ` +
  `sintaxe e boas praticas), mesmo que o curso original use versoes antigas. ` +
  `Mantenha a materia e os conceitos da aula; atualize apenas a forma (codigo, APIs e padroes).`;

// Coleta modulos "folha" (que contem aulas diretamente) preservando o path
// relativo ao curso, usado pelo backend pra achar as transcricoes.
// Conta tanto lesson-group (aula ja reconhecida) quanto video "cru" (lesson
// .mp4 sem _dub) — sao justamente os que precisam de transcricao via WhisperX.
const VIDEO_RE = /\.(mp4|webm|ts|m3u8|mkv)$/i;
const collectModules = (content, acc = []) => {
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

// A (padrao) = rapido e barato, leitura rica (pode enriquecer um pouco alem dos
// videos). C = raciocina mais, tende a respeitar mais a fonte, ~75% mais caro.
const MODELS = [
  { key: "deepseek-v4-flash", label: "Padrao — rico, rapido e barato" },
  { key: "deepseek-v4-pro", label: "Mais fiel a fonte — raciocina mais, +caro" },
];

const ReadingCourseModal = ({ open, onClose, courseTitle, courseContent }) => {
  const modules = useMemo(() => collectModules(courseContent), [courseContent]);
  const [selected, setSelected] = useState(() => new Set(modules.map((m) => m.path)));
  const [model, setModel] = useState("deepseek-v4-flash");
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  // O botao "Gerar" so libera depois que o usuario revisa/ajusta a instrucao
  // (ex.: fixar a versao certa — Java 25, Spring Boot 4.x). Editar ja marca como
  // revisado; quem mantem o padrao confirma no checkbox.
  const [instructionOk, setInstructionOk] = useState(false);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [language, setLanguage] = useState("pt"); // idioma do curso ORIGINAL
  const [genMaterials, setGenMaterials] = useState(true);
  const [materialKinds, setMaterialKinds] = useState(
    () => new Set(MATERIAL_KINDS.map((k) => k.key)),
  );
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(null);
  const [live, setLive] = useState(null); // pipeline ao vivo do modulo atual
  const [done, setDone] = useState([]); // [{ module, created, skipped, error }]
  const cancelRef = useRef(false);

  if (!open) return null;

  const toggle = (path) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const toggleKind = (key) =>
    setMaterialKinds((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Gera os materiais (IA) de UMA aula de leitura ja criada. Texto vai junto num
  // generateIa; pre-quiz e podcast tem fluxo proprio. Sem 'resumo' (e a leitura).
  const runLessonMaterials = async (leituraTitle, prefix, kinds) => {
    const text = kinds.filter((k) => TEXT_KINDS.has(k));
    if (text.length) {
      await generateIa({ courseTitle: leituraTitle, lessonPrefix: prefix, kinds: text, model });
    }
    if (kinds.includes("prequiz")) {
      await generatePrequestions({ courseTitle: leituraTitle, lessonPrefix: prefix, model });
    }
    if (kinds.includes("podcast")) {
      const s = await generatePodcastScript({ courseTitle: leituraTitle, lessonPrefix: prefix, model });
      await generatePodcastAudio({ courseTitle: leituraTitle, lessonPrefix: prefix, title: s.title, turns: s.turns, model });
    }
  };

  const handleGenerate = async () => {
    const chosen = modules.filter((m) => selected.has(m.path));
    if (chosen.length === 0) return;
    setDone([]);
    setLoading(true);
    cancelRef.current = false;
    for (const mod of chosen) {
      if (cancelRef.current) break;
      setCurrent(mod.title);
      setLive({ module: mod.title, transcricao: null, transcribed: 0, leituraTotal: null, aulas: [], mats: null });
      // index = posicao do modulo no curso inteiro (estavel entre rodadas),
      // pra a numeracao das pastas (01, 02, ...) nao colidir ao gerar um por vez.
      const index = modules.findIndex((m) => m.path === mod.path) + 1;

      // Atualiza a pipeline ao vivo conforme os eventos do stream do backend.
      const onProgress = (ev) =>
        setLive((L) => {
          if (!L) return L;
          if (ev.type === "transcricao") {
            return { ...L, transcricao: ev.status, transcribed: ev.transcribed ?? L.transcribed };
          }
          if (ev.type === "plano") {
            return { ...L, leituraTotal: ev.total, aulas: Array.from({ length: ev.total }, () => "queue") };
          }
          if (ev.type === "aula") {
            const aulas = L.aulas.slice();
            aulas[ev.i] = ev.status === "start" ? "doing" : ev.ok ? "ok" : "fail";
            return { ...L, aulas };
          }
          return L;
        });

      try {
        const out = await generateReadingModule({
          courseTitle,
          modulePath: mod.path,
          moduleTitle: mod.title,
          index,
          model,
          instruction: instruction.trim(),
          autoTranscribe,
          language,
          onProgress,
        });

        // #6: apos a leitura, gera o resto do "Gerar IA" (sem resumo) pra cada
        // aula criada, no curso "- Leitura" — em paralelo (mostra o paralelismo).
        let materials = null;
        const kinds = [...materialKinds];
        const lessons = (out.created || []).filter((c) => c.ok && c.prefix);
        if (genMaterials && kinds.length && lessons.length) {
          const leituraTitle = `${courseTitle} - Leitura`;
          const states = Array.from({ length: lessons.length }, () => "queue");
          setLive((L) => (L ? { ...L, mats: { total: lessons.length, states: states.slice() } } : L));
          materials = { ok: 0, fail: 0, total: lessons.length, errors: [] };
          const syncMats = () => setLive((L) => (L ? { ...L, mats: { total: lessons.length, states: states.slice() } } : L));
          await runPool(
            lessons.map((l, i) => ({ l, i })),
            MAT_CONCURRENCY,
            async ({ l, i }) => {
              if (cancelRef.current) return;
              states[i] = "doing"; syncMats();
              try {
                await runLessonMaterials(leituraTitle, l.prefix, kinds);
                materials.ok += 1; states[i] = "ok";
              } catch (err) {
                materials.fail += 1; states[i] = "fail";
                materials.errors.push(`${l.prefix}: ${err.message}`);
              }
              syncMats();
            },
          );
        }

        setDone((prev) => [...prev, { module: mod.title, ...out, materials }]);
      } catch (err) {
        setDone((prev) => [...prev, { module: mod.title, error: err.message }]);
      }
    }
    setCurrent(null);
    setLive(null);
    setLoading(false);
  };

  const okLessons = done.reduce(
    (n, d) => n + (d.created?.filter((c) => c.ok).length || 0),
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-300">
              <BookOpenText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-slate-100 font-semibold text-lg">Gerar curso de leitura</h3>
              <p className="text-slate-400 text-sm mt-0.5">
                A IA agrupa as aulas e condensa as transcricoes em texto enxuto. Cria a pasta{" "}
                <span className="text-slate-300 font-mono">{courseTitle} - Leitura</span>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-500 hover:text-slate-300 leading-none disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Instrucao extra <span className="text-slate-600 normal-case">(opcional)</span>
            </label>
            <textarea
              value={instruction}
              onChange={(e) => { setInstruction(e.target.value); setInstructionOk(true); }}
              disabled={loading}
              rows={4}
              placeholder="Ex.: modernize o conteudo e os exemplos para Spring Boot 4.x e Java 25, mesmo que o curso original use versoes antigas."
              className="mt-1.5 w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 resize-y focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Aplicada na geracao da leitura de cada aula. Tem prioridade sobre a fidelidade a transcricao.
            </p>
            <label className="flex items-start gap-2 cursor-pointer select-none mt-2">
              <input
                type="checkbox"
                checked={instructionOk}
                onChange={(e) => setInstructionOk(e.target.checked)}
                disabled={loading}
                className="mt-0.5 accent-emerald-500"
              />
              <span className="text-[12px] text-amber-300/90">
                Revisei a instrucao acima (confira as <b>versoes/tecnologias</b>, ex.: Java 25, Spring Boot 4.x — o modelo as vezes chuta versoes antigas).
              </span>
            </label>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoTranscribe}
              onChange={(e) => setAutoTranscribe(e.target.checked)}
              disabled={loading}
              className="mt-0.5 accent-emerald-500"
            />
            <span className="text-sm text-slate-300">
              Transcrever aulas sem .txt com WhisperX
              <span className="block text-[11px] text-slate-500">
                Aulas que so tem video sao transcritas (GPU/CPU conforme o .env) antes de gerar a leitura.
              </span>
            </span>
          </label>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">Idioma do curso original</label>
            <div className="mt-1.5 flex gap-2">
              {[
                { key: "pt", label: "Portugues" },
                { key: "en", label: "Ingles" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => !loading && setLanguage(opt.key)}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    language === opt.key
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                      : "border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {language === "en"
                ? "Curso em ingles: transcreve com modelo EN e a leitura sai em portugues (termos tecnicos preservados)."
                : "A saida da leitura e sempre em portugues do Brasil."}
            </p>
          </div>

          <div className="rounded-lg border border-slate-700/60 p-3">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={genMaterials}
                onChange={(e) => setGenMaterials(e.target.checked)}
                disabled={loading}
                className="mt-0.5 accent-emerald-500"
              />
              <span className="text-sm text-slate-300">
                Gerar materiais (IA) apos a leitura
                <span className="block text-[11px] text-slate-500">
                  Quando a leitura de cada aula terminar, gera os materiais marcados na propria
                  aula. O <b>resumo</b> nao entra — a leitura ja e o resumo.
                </span>
              </span>
            </label>
            {genMaterials && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {MATERIAL_KINDS.map((k) => {
                  const on = materialKinds.has(k.key);
                  return (
                    <button
                      key={k.key}
                      onClick={() => !loading && toggleKind(k.key)}
                      disabled={loading}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        on
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      {k.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {modules.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">
              Nenhum modulo com aulas encontrado neste curso.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  Modulos ({selected.size}/{modules.length})
                </span>
                <div className="flex gap-3 text-xs">
                  <button
                    onClick={() => setSelected(new Set(modules.map((m) => m.path)))}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Selecionar todos
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-slate-400 hover:text-slate-300"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {modules.map((m) => {
                  const on = selected.has(m.path);
                  const result = done.find((d) => d.module === m.title);
                  return (
                    <div key={m.path}>
                    <button
                      onClick={() => !loading && toggle(m.path)}
                      disabled={loading}
                      className={`w-full flex items-center gap-2 py-1.5 px-2 rounded text-sm text-left transition-colors ${
                        on ? "bg-blue-500/10 text-blue-200" : "text-slate-400 hover:bg-slate-800/50"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0 ${
                          on ? "bg-blue-500 border-blue-500 text-white" : "border-slate-600"
                        }`}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="truncate flex-1">{m.title}</span>
                      {(current === m.title || current?.startsWith(`${m.title} —`)) && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      )}
                      {result?.error && (
                        <AlertTriangle className="w-4 h-4 text-amber-400" title={result.error} />
                      )}
                      {result && !result.error && (
                        <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          {result.transcription?.transcribed > 0 && (
                            <span className="text-sky-400">
                              {result.transcription.transcribed} transcrita
                              {result.transcription.transcribed > 1 ? "s" : ""} ·{" "}
                            </span>
                          )}
                          {result.skipped ? "sem transcricao" : `${result.created?.filter((c) => c.ok).length || 0} aulas`}
                          {result.materials && (
                            <span
                              className="text-amber-400"
                              title={result.materials.errors?.join("\n") || undefined}
                            >
                              {" "}· {result.materials.ok}/{result.materials.total} c/ materiais
                              {result.materials.fail > 0 ? ` (${result.materials.fail} falhou)` : ""}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                    {live?.module === m.title && (
                      <div className="ml-6 mb-1 mt-1 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-[11px] text-slate-400 space-y-1.5">
                        {autoTranscribe && (
                          <div>
                            Transcricao:{" "}
                            {live.transcricao === "start"
                              ? "em andamento..."
                              : live.transcricao === "done"
                                ? `${live.transcribed || 0} feita(s)`
                                : "—"}
                          </div>
                        )}
                        <div>
                          Leitura{" "}
                          {live.leituraTotal != null
                            ? `(${live.aulas.filter((s) => s === "ok" || s === "fail").length}/${live.leituraTotal})`
                            : "— preparando..."}
                          {live.aulas.length > 0 && <Dots states={live.aulas} />}
                        </div>
                        {live.mats && (
                          <div>
                            Materiais ({live.mats.states.filter((s) => s === "ok" || s === "fail").length}/{live.mats.total})
                            <Dots states={live.mats.states} />
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-slate-700/50 flex items-center justify-between gap-3">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
          >
            {MODELS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            {!loading && !instructionOk && (
              <span className="text-xs text-amber-400">Revise a instrucao pra liberar</span>
            )}
            {done.length > 0 && !loading && (
              <span className="text-xs text-slate-400">{okLessons} aulas geradas</span>
            )}
            {loading ? (
              <button
                onClick={() => (cancelRef.current = true)}
                className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm"
              >
                Cancelar
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={selected.size === 0 || !instructionOk}
                title={!instructionOk ? "Revise/ajuste a instrucao extra e marque a confirmacao" : undefined}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Gerar {selected.size > 0 ? selected.size : ""} modulo{selected.size > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadingCourseModal;
