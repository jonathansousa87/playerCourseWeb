import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { generateIa, generatePrequestions, generatePodcastScript, generatePodcastAudio, generateNarration } from "../utils/progressApi";
import { INSTRUCTION_PRESETS } from "../utils/instructionPresets";

const KIND_OPTIONS = [
  { key: "prequiz", label: "Pre-Quiz", icon: "🎯" },
  { key: "resumo", label: "Leitura", icon: "📄" },
  { key: "exemplos", label: "Pratica", icon: "💪" },
  { key: "quiz", label: "Quiz", icon: "❓" },
  { key: "flashcards", label: "Flashcards", icon: "🔁" },
  { key: "diario", label: "Diario", icon: "📓" },
  { key: "narracao", label: "Narracao", icon: "🔊" },
  { key: "podcast", label: "Podcast", icon: "🎙️" },
];

const MODELS = [
  { id: "deepseek-v4-flash", label: "deepseek-v4-flash (rapido, ~$0.0019/aula)" },
  { id: "deepseek-v4-pro", label: "deepseek-v4-pro (raciocina mais, 3x o preco)" },
];

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
};

// Roda `worker` sobre os items com no maximo `limit` em paralelo. O backend
// limita a concorrencia real na API DeepSeek + faz retry/backoff.
const runPool = async (items, limit, worker) => {
  let i = 0;
  const run = async () => {
    while (i < items.length) await worker(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
};
// Teto do front com folga; o limite REAL e o semaforo do backend (DEEPSEEK_CONCURRENCY).
const PAIR_CONCURRENCY = 6;

// Coleta lesson-groups da arvore preservando a hierarquia de modulos pra exibicao
const walkTree = (content, depth = 0) => {
  const rows = [];
  for (const item of content || []) {
    if (item.type === "lesson-group") {
      rows.push({ kind: "lesson", item, depth });
    } else if (item.type === "module") {
      rows.push({ kind: "module", item, depth });
      if (item.content) {
        rows.push(...walkTree(item.content, depth + 1));
      }
    }
  }
  return rows;
};

// Retorna todos os prefixes de lesson-groups dentro de um node (modulo ou aula)
const collectPrefixes = (node) => {
  if (node.type === "lesson-group") return [node.prefix];
  if (node.type === "module" && node.content) {
    return node.content.flatMap((c) => collectPrefixes(c));
  }
  return [];
};

const BulkAIGenerateModal = ({
  open,
  onClose,
  courseTitle,
  courseContent,
  onGenerated,
}) => {
  const [selectedLessons, setSelectedLessons] = useState(() => new Set());
  // Curso de leitura: o "resumo" ja eh a propria leitura (gerada rica). Gerar
  // de novo sobrescreveria pela versao fraca — entao vem desmarcado por padrao.
  const isReadingCourse = / - Leitura$/i.test(courseTitle || "");
  // Default: todos os tipos marcados (menos resumo em curso de leitura).
  const [selectedKinds, setSelectedKinds] = useState(
    () =>
      new Set(
        KIND_OPTIONS.map((opt) => opt.key).filter(
          (k) => !(isReadingCourse && k === "resumo"),
        ),
      ),
  );
  const [niche, setNiche] = useState("");
  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [loading, setLoading] = useState(false);
  const [currentPrefix, setCurrentPrefix] = useState(null);
  const [currentKind, setCurrentKind] = useState(null);
  const [completedPairs, setCompletedPairs] = useState([]); // [{prefix, title, kind, ok, error}]
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(null);
  const cancelRef = useRef(false);

  const rows = useMemo(() => walkTree(courseContent || []), [courseContent]);
  const allPrefixes = useMemo(
    () => rows.filter((r) => r.kind === "lesson").map((r) => r.item.prefix),
    [rows]
  );

  useEffect(() => {
    if (!loading) return;
    startedAtRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current);
    }, 250);
    return () => clearInterval(id);
  }, [loading]);

  if (!open) return null;

  const toggleLesson = (prefix) => {
    setSelectedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  const toggleKind = (key) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllLessons = () => {
    setSelectedLessons(new Set(allPrefixes));
  };

  const clearAllLessons = () => {
    setSelectedLessons(new Set());
  };

  const toggleModule = (moduleNode) => {
    const prefixes = collectPrefixes(moduleNode);
    if (prefixes.length === 0) return;
    setSelectedLessons((prev) => {
      const next = new Set(prev);
      const allSelected = prefixes.every((p) => next.has(p));
      if (allSelected) {
        prefixes.forEach((p) => next.delete(p));
      } else {
        prefixes.forEach((p) => next.add(p));
      }
      return next;
    });
  };

  const totalPairs = selectedLessons.size * selectedKinds.size;
  const donePairs = completedPairs.length;
  const percent = totalPairs > 0 ? (donePairs / totalPairs) * 100 : 0;
  const okCount = completedPairs.filter((c) => c.ok).length;
  const errCount = completedPairs.length - okCount;
  const finished = !loading && completedPairs.length > 0;

  const handleGenerate = async () => {
    if (selectedLessons.size === 0 || selectedKinds.size === 0) return;

    const lessons = rows
      .filter((r) => r.kind === "lesson" && selectedLessons.has(r.item.prefix))
      .map((r) => r.item);
    const kinds = [...selectedKinds];

    setCompletedPairs([]);
    setLoading(true);
    cancelRef.current = false;

    // Gera UM par (aula, tipo) DeepSeek e devolve o resultado normalizado.
    // (O podcast tem fluxo proprio: roteiro + audio.)
    const instr = instruction.trim();
    const runPair = async (lesson, kind) => {
      const base = { prefix: lesson.prefix, title: lesson.title, kind };
      try {
        if (kind === "prequiz") {
          const out = await generatePrequestions({ courseTitle, lessonPrefix: lesson.prefix, model, instruction: instr });
          return { ...base, ok: true, error: null, file: `${out.questions.length} perguntas no DB` };
        }
        const out = await generateIa({ courseTitle, lessonPrefix: lesson.prefix, kinds: [kind], model, instruction: instr });
        const res = out.results?.[0];
        return { ...base, ok: !!res?.ok, error: res?.ok ? null : res?.error || "falha", file: res?.file || null };
      } catch (err) {
        return { ...base, ok: false, error: err.message || "erro" };
      }
    };

    const hasPodcast = kinds.includes("podcast");
    const hasNarration = kinds.includes("narracao");
    // narracao e podcast usam o Kokoro (GPU unica) -> ficam FORA do pool de texto.
    const serialKinds = kinds.filter((k) => k !== "podcast" && k !== "narracao");

    // Materiais DeepSeek: TODOS os pares (aula x tipo) num pool com teto. O
    // backend limita a concorrencia real na API e re-tenta em 429/503.
    const textPairs = [];
    for (const lesson of lessons) {
      for (const kind of serialKinds) textPairs.push({ lesson, kind });
    }
    const textRun = runPool(textPairs, PAIR_CONCURRENCY, async ({ lesson, kind }) => {
      if (cancelRef.current) return;
      setCurrentPrefix(lesson.prefix);
      setCurrentKind(kind);
      const pair = await runPair(lesson, kind);
      setCompletedPairs((prev) => [...prev, pair]);
    });

    // Midia (Kokoro): narracao e podcast usam a MESMA GPU, entao rodam UM por vez,
    // numa fila so, em paralelo com o pool de texto acima.
    const mediaRun = (async () => {
      if (!hasNarration && !hasPodcast) return;
      for (const lesson of lessons) {
        if (cancelRef.current) break;
        if (hasNarration) {
          setCurrentPrefix(lesson.prefix);
          setCurrentKind("narracao");
          const base = { prefix: lesson.prefix, title: lesson.title, kind: "narracao" };
          try {
            const out = await generateNarration({ courseTitle, lessonPrefix: lesson.prefix });
            setCompletedPairs((prev) => [...prev, { ...base, ok: true, error: null, file: `${out.blocks} blocos — ${Math.round(out.duration)}s` }]);
          } catch (err) {
            setCompletedPairs((prev) => [...prev, { ...base, ok: false, error: err.message || "erro" }]);
          }
        }
        if (cancelRef.current) break;
        if (hasPodcast) {
          setCurrentPrefix(lesson.prefix);
          setCurrentKind("podcast");
          const base = { prefix: lesson.prefix, title: lesson.title, kind: "podcast" };
          try {
            const script = await generatePodcastScript({ courseTitle, lessonPrefix: lesson.prefix, model });
            const out = await generatePodcastAudio({ courseTitle, lessonPrefix: lesson.prefix, title: script.title, turns: script.turns, model });
            setCompletedPairs((prev) => [...prev, { ...base, ok: true, error: null, file: `${out.turns} falas — ${out.title}` }]);
          } catch (err) {
            setCompletedPairs((prev) => [...prev, { ...base, ok: false, error: err.message || "erro" }]);
          }
        }
      }
    })();

    await Promise.all([textRun, mediaRun]);

    setCurrentPrefix(null);
    setCurrentKind(null);
    setLoading(false);
    onGenerated?.();
  };

  const handleCancel = () => {
    cancelRef.current = true;
  };

  const handleClose = () => {
    if (loading) return;
    setCompletedPairs([]);
    setElapsed(0);
    onClose();
  };

  const lessonCount = selectedLessons.size;
  const kindCount = selectedKinds.size;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-800/60">
          <div>
            <h3 className="text-slate-100 font-semibold text-lg">Gerar IA em lote</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              Selecione aulas e os tipos de material — o DeepSeek vai gerar cada item em sequencia.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            aria-label="Fechar"
            className="text-slate-500 hover:text-slate-300 leading-none disabled:opacity-40"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Seleção: aulas + tipos */}
        {!loading && !finished && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-6 pt-4 pb-3 border-b border-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Tipos de material ({selectedKinds.size}/{KIND_OPTIONS.length})
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedKinds(new Set(KIND_OPTIONS.map((o) => o.key)))}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Marcar todos
                  </button>
                  <span className="text-slate-700">|</span>
                  <button
                    onClick={() => setSelectedKinds(new Set())}
                    className="text-xs text-slate-400 hover:text-slate-300"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {KIND_OPTIONS.map((opt) => {
                  const on = selectedKinds.has(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => toggleKind(opt.key)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                        on
                          ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
                          : "border-slate-700/50 bg-slate-800/40 text-slate-400 hover:bg-slate-800/80"
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-6 pt-3 pb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Aulas ({allPrefixes.length})
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAllLessons}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Selecionar todas
                </button>
                <span className="text-slate-700">|</span>
                <button
                  onClick={clearAllLessons}
                  className="text-xs text-slate-400 hover:text-slate-300"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
              {rows.map((row, i) => {
                if (row.kind === "module") {
                  const prefixes = collectPrefixes(row.item);
                  const selCount = prefixes.filter((p) =>
                    selectedLessons.has(p)
                  ).length;
                  const allSel = selCount > 0 && selCount === prefixes.length;
                  return (
                    <div
                      key={`m-${i}`}
                      style={{ marginLeft: `${row.depth * 12}px` }}
                      className="flex items-center gap-2 py-1.5 text-slate-300 text-sm font-medium"
                    >
                      <button
                        onClick={() => toggleModule(row.item)}
                        className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                          allSel
                            ? "bg-blue-500 border-blue-500 text-white"
                            : selCount > 0
                              ? "bg-blue-500/30 border-blue-500/60 text-blue-200"
                              : "border-slate-600"
                        }`}
                      >
                        {allSel ? "✓" : selCount > 0 ? "–" : ""}
                      </button>
                      <span className="truncate flex-1">{row.item.title}</span>
                      <span className="text-[11px] text-slate-500">
                        {selCount}/{prefixes.length}
                      </span>
                    </div>
                  );
                }
                const lesson = row.item;
                const on = selectedLessons.has(lesson.prefix);
                return (
                  <button
                    key={`l-${lesson.prefix}-${i}`}
                    onClick={() => toggleLesson(lesson.prefix)}
                    style={{ marginLeft: `${(row.depth + 1) * 12}px` }}
                    className={`w-full flex items-center gap-2 py-1.5 px-2 rounded text-sm text-left transition-colors ${
                      on
                        ? "bg-blue-500/10 text-blue-200"
                        : "text-slate-400 hover:bg-slate-800/50"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0 ${
                        on ? "bg-blue-500 border-blue-500 text-white" : "border-slate-600"
                      }`}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="truncate">{lesson.title}</span>
                  </button>
                );
              })}
              {rows.length === 0 && (
                <div className="text-xs text-slate-500 py-8 text-center">
                  Nenhuma aula com video encontrada neste curso.
                </div>
              )}
            </div>

            {/* Nicho/instrucao (opcional) — mesmo dos outros modais; moderniza os materiais */}
            {!loading && niche && (
              <div className="px-6 pt-3">
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800/70 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 text-xs resize-y focus:outline-none focus:border-blue-500/40"
                />
              </div>
            )}
            <div className="px-6 py-3 border-t border-slate-800/60 bg-slate-900/80 flex items-center gap-3 flex-wrap">
              <label className="text-xs text-slate-400">Nicho</label>
              <select
                value={niche}
                onChange={(e) => {
                  const key = e.target.value;
                  setNiche(key);
                  const preset = INSTRUCTION_PRESETS.find((p) => p.key === key);
                  setInstruction(preset ? preset.text : "");
                }}
                className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500/40"
              >
                <option value="">Sem instrucao</option>
                {INSTRUCTION_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
              <label className="text-xs text-slate-400">Modelo</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500/40"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="flex-1 text-xs text-slate-500">
                {lessonCount} aula(s) × {kindCount} tipo(s) = <b className="text-slate-300">{totalPairs}</b> geracao(oes)
              </div>
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerate}
                disabled={totalPairs === 0}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Gerar {totalPairs}
              </button>
            </div>
          </div>
        )}

        {/* Execução */}
        {loading && (
          <div className="flex-1 overflow-hidden flex flex-col p-6">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>
                {donePairs} de {totalPairs} concluido(s) · {okCount} OK · {errCount} erro(s)
              </span>
              <span className="font-mono">{fmtTime(elapsed)}</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>

            {currentPrefix && (
              <div className="text-xs text-blue-300 mb-3">
                Gerando <b className="capitalize">{currentKind}</b> de{" "}
                <span className="text-blue-200">{currentPrefix}</span>...
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 pr-1">
              {completedPairs.slice().reverse().map((p, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                    p.ok ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  <span className="w-4 text-center">{p.ok ? "✓" : "✗"}</span>
                  <span className="capitalize w-20 text-slate-400">{p.kind}</span>
                  <span className="flex-1 truncate text-slate-300">{p.title}</span>
                  {!p.ok && <span className="text-red-400 truncate max-w-[40%]">{p.error}</span>}
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/60 flex justify-between items-center">
              <p className="text-[11px] text-slate-500">
                Cada item leva 15-60s. Nao feche essa janela.
              </p>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs text-red-300 hover:text-red-200 border border-red-500/20 hover:border-red-500/40 rounded-lg"
              >
                Parar apos atual
              </button>
            </div>
          </div>
        )}

        {/* Resultado final */}
        {finished && (
          <div className="flex-1 overflow-hidden flex flex-col p-6">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span>
                Concluido em <span className="font-mono">{fmtTime(elapsed)}</span>
              </span>
              <span>
                {okCount} sucesso / {errCount} falha
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 mb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 pr-1">
              {completedPairs.map((p, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs border ${
                    p.ok
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
                      : "border-red-500/20 bg-red-500/5 text-red-200"
                  }`}
                >
                  <span className="w-4 text-center">{p.ok ? "✓" : "✗"}</span>
                  <span className="capitalize w-20 opacity-70">{p.kind}</span>
                  <span className="flex-1 truncate">{p.title}</span>
                  {!p.ok && <span className="truncate max-w-[40%] opacity-80">{p.error}</span>}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkAIGenerateModal;
