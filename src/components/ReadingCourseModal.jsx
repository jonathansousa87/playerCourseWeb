import React, { useMemo, useState, useRef } from "react";
import { X, BookOpenText, Loader2, Check, AlertTriangle } from "lucide-react";
import { generateReadingModule } from "../utils/progressApi";

// Coleta modulos "folha" (que contem aulas diretamente) preservando o path
// relativo ao curso, usado pelo backend pra achar as transcricoes.
const collectModules = (content, acc = []) => {
  for (const item of content || []) {
    if (item.type === "module") {
      const hasLessons = (item.content || []).some((c) => c.type === "lesson-group");
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
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(null);
  const [done, setDone] = useState([]); // [{ module, created, skipped, error }]
  const cancelRef = useRef(false);

  if (!open) return null;

  const toggle = (path) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const handleGenerate = async () => {
    const chosen = modules.filter((m) => selected.has(m.path));
    if (chosen.length === 0) return;
    setDone([]);
    setLoading(true);
    cancelRef.current = false;
    for (const mod of chosen) {
      if (cancelRef.current) break;
      setCurrent(mod.title);
      // index = posicao do modulo no curso inteiro (estavel entre rodadas),
      // pra a numeracao das pastas (01, 02, ...) nao colidir ao gerar um por vez.
      const index = modules.findIndex((m) => m.path === mod.path) + 1;
      try {
        const out = await generateReadingModule({
          courseTitle,
          modulePath: mod.path,
          moduleTitle: mod.title,
          index,
          model,
        });
        setDone((prev) => [...prev, { module: mod.title, ...out }]);
      } catch (err) {
        setDone((prev) => [...prev, { module: mod.title, error: err.message }]);
      }
    }
    setCurrent(null);
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
                    <button
                      key={m.path}
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
                      {current === m.title && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      )}
                      {result?.error && (
                        <AlertTriangle className="w-4 h-4 text-amber-400" title={result.error} />
                      )}
                      {result && !result.error && (
                        <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          {result.skipped ? "sem transcricao" : `${result.created?.filter((c) => c.ok).length || 0} aulas`}
                        </span>
                      )}
                    </button>
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
                disabled={selected.size === 0}
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
