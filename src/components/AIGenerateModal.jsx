import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { generateIa, generatePrequestions } from "../utils/progressApi";

// "prequiz" eh especial: nao gera arquivo no disco, salva no Postgres
// (lesson_prequestions). Roteado pra um endpoint diferente em handleGenerate.
const KIND_OPTIONS = [
  { key: "prequiz", label: "Pre-Quiz (perguntas-iscas)", icon: "🎯", color: "yellow" },
  { key: "resumo", label: "Resumo", icon: "📄", color: "emerald" },
  { key: "exemplos", label: "Exemplos praticos", icon: "💡", color: "amber" },
  { key: "piada", label: "Piada da aula", icon: "😄", color: "pink" },
  { key: "quiz", label: "Quiz", icon: "❓", color: "purple" },
  { key: "flashcards", label: "Flashcards", icon: "🔁", color: "cyan" },
  { key: "diario", label: "Diario tecnico", icon: "📓", color: "rose" },
];

const MODELS = [
  { id: "deepseek-v4-flash", label: "deepseek-v4-flash (rapido, ~$0.0019/aula)" },
  { id: "deepseek-v4-pro", label: "deepseek-v4-pro (raciocina mais, 3x o preco)" },
];

const COLOR_CLASSES = {
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  yellow: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  purple: "border-purple-500/40 bg-purple-500/10 text-purple-200",
  cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  pink: "border-pink-500/40 bg-pink-500/10 text-pink-200",
};

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const AIGenerateModal = ({
  open,
  onClose,
  courseTitle,
  lessonPrefix,
  onGenerated,
}) => {
  const [selected, setSelected] = useState(() => new Set(["resumo"]));
  const [model, setModel] = useState("deepseek-v4-flash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ current: null, done: [], errors: [] });
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(null);

  useEffect(() => {
    if (!loading) return;
    startedAtRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current);
    }, 250);
    return () => clearInterval(id);
  }, [loading]);

  if (!open) return null;

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selected.size === 0) return;
    const kinds = [...selected];
    setLoading(true);
    setError(null);
    setProgress({ current: null, done: [], errors: [] });

    const allResults = [];
    for (const kind of kinds) {
      setProgress((p) => ({ ...p, current: kind }));
      try {
        let res;
        if (kind === "prequiz") {
          // Pre-quiz salva no DB (lesson_prequestions), nao em arquivo.
          // Adapta a resposta pro shape unificado { kind, ok, file, ... }.
          const out = await generatePrequestions({ courseTitle, lessonPrefix, model });
          res = {
            kind,
            ok: true,
            file: `${out.questions.length} perguntas no DB`,
            usage: out.usage,
            model: out.model,
          };
        } else {
          const out = await generateIa({
            courseTitle,
            lessonPrefix,
            kinds: [kind],
            model,
          });
          res = out.results?.[0];
        }

        if (res?.ok) {
          allResults.push(res);
          setProgress((p) => ({ ...p, done: [...p.done, res] }));
        } else {
          allResults.push(res || { kind, ok: false, error: "falha" });
          setProgress((p) => ({
            ...p,
            errors: [...p.errors, res || { kind, ok: false, error: "falha" }],
          }));
        }
      } catch (err) {
        const failed = { kind, ok: false, error: err.message || "erro" };
        allResults.push(failed);
        setProgress((p) => ({ ...p, errors: [...p.errors, failed] }));
      }
    }

    setProgress((p) => ({ ...p, current: null }));
    setLoading(false);
    onGenerated?.({ results: allResults });
  };

  const handleClose = () => {
    if (loading) return;
    setProgress({ current: null, done: [], errors: [] });
    setError(null);
    setElapsed(0);
    onClose();
  };

  const totalKinds = selected.size;
  const completedCount = progress.done.length + progress.errors.length;
  const percent = totalKinds > 0 ? (completedCount / totalKinds) * 100 : 0;
  const finished = !loading && completedCount > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-slate-100 font-semibold">Gerar com IA</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              DeepSeek ira ler o .vtt da aula e criar os arquivos selecionados (sufixo _ia).
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            aria-label="Fechar"
            className="text-slate-500 hover:text-slate-300 leading-none disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seleção de opções (enquanto não tem nada em andamento ou concluído) */}
        {!loading && !finished && (
          <>
            <div className="space-y-2 mb-4">
              {KIND_OPTIONS.map((opt) => {
                const on = selected.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    onClick={() => toggle(opt.key)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-left ${
                      on
                        ? COLOR_CLASSES[opt.color]
                        : "border-slate-700/50 bg-slate-800/40 text-slate-400 hover:bg-slate-800/80"
                    }`}
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <span className="flex-1 font-medium">{opt.label}</span>
                    <span
                      className={`w-4 h-4 rounded border-2 ${
                        on ? "bg-current border-current" : "border-slate-600"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <label className="block text-xs text-slate-400 mb-1">Modelo</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-slate-200 text-sm mb-4 focus:outline-none focus:border-blue-500/40"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            {error && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerate}
                disabled={selected.size === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              >
                Gerar {selected.size} item(s)
              </button>
            </div>
          </>
        )}

        {/* Progresso em execução */}
        {loading && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>
                  {completedCount} de {totalKinds} concluido(s)
                </span>
                <span className="font-mono">{fmtTime(elapsed)}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {[...selected].map((kind) => {
                const opt = KIND_OPTIONS.find((o) => o.key === kind);
                const done = progress.done.find((r) => r.kind === kind);
                const err = progress.errors.find((r) => r.kind === kind);
                const isCurrent = progress.current === kind;
                return (
                  <div
                    key={kind}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                      done
                        ? "bg-emerald-500/10 text-emerald-300"
                        : err
                          ? "bg-red-500/10 text-red-300"
                          : isCurrent
                            ? "bg-blue-500/10 text-blue-300 animate-pulse"
                            : "bg-slate-800/40 text-slate-500"
                    }`}
                  >
                    <span>{opt?.icon}</span>
                    <span className="flex-1">{opt?.label}</span>
                    <span>
                      {done ? "✓" : err ? "✗" : isCurrent ? "gerando..." : "na fila"}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              Cada item leva 15-60s. Nao feche essa janela.
            </p>
          </div>
        )}

        {/* Resultado final */}
        {finished && (
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span>
                Concluido em <span className="font-mono">{fmtTime(elapsed)}</span>
              </span>
              <span>
                {progress.done.length} sucesso / {progress.errors.length} falha
              </span>
            </div>
            <div className="space-y-2 mb-4">
              {[...progress.done, ...progress.errors].map((r, i) => (
                <div
                  key={i}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    r.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-red-500/30 bg-red-500/10 text-red-200"
                  }`}
                >
                  <div className="font-medium capitalize">
                    {r.kind} {r.ok ? "✓" : "✗"}
                  </div>
                  {r.ok && r.file && (
                    <div className="text-xs opacity-80 truncate">{r.file}</div>
                  )}
                  {r.ok && r.deck && (
                    <div className="text-xs opacity-80">
                      Deck: {r.deck.inserted} novos / {r.deck.total} total
                    </div>
                  )}
                  {!r.ok && <div className="text-xs opacity-80">{r.error}</div>}
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

export default AIGenerateModal;
