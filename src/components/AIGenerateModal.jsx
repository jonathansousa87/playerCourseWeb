import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { generateIa, generatePrequestions, generatePodcastScript, generatePodcastAudio } from "../utils/progressApi";
import { INSTRUCTION_PRESETS } from "../utils/instructionPresets";

// kinds que correspondem a uma chave de `materials` (pra detectar "ja gerado").
// prequiz nao tem material em lesson_materials (e on-demand) — sempre "a gerar".
const MATERIAL_KEYS = new Set(["resumo", "exemplos", "piada", "quiz", "flashcards", "diario", "podcast"]);

// "prequiz" eh especial: nao gera arquivo no disco, salva no Postgres
// (lesson_prequestions). Roteado pra um endpoint diferente em handleGenerate.
const KIND_OPTIONS = [
  { key: "prequiz", label: "Pre-Quiz (perguntas-iscas)", icon: "🎯", color: "yellow" },
  { key: "resumo", label: "Leitura (texto rico)", icon: "📄", color: "emerald" },
  { key: "exemplos", label: "Pratica", icon: "💪", color: "amber" },
  { key: "quiz", label: "Quiz", icon: "❓", color: "purple" },
  { key: "flashcards", label: "Flashcards", icon: "🔁", color: "cyan" },
  { key: "diario", label: "Diario tecnico", icon: "📓", color: "rose" },
  { key: "podcast", label: "Podcast (audio, ~5 min)", icon: "🎙️", color: "blue" },
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
  blue: "border-blue-500/40 bg-blue-500/10 text-blue-200",
};

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Roda `worker` sobre os items com no maximo `limit` em paralelo. O backend
// (deepseek.js) ainda limita a concorrencia real na API + faz retry/backoff,
// entao paralelizar aqui e seguro.
const runPool = async (items, limit, worker) => {
  let i = 0;
  const run = async () => {
    while (i < items.length) await worker(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
};
// Teto do front com folga; o limite REAL e o semaforo do backend (DEEPSEEK_CONCURRENCY).
const KIND_CONCURRENCY = 6;

const AIGenerateModal = ({
  open,
  onClose,
  courseTitle,
  lessonPrefix,
  existingKinds = [],
  onGenerated,
}) => {
  // Default: marca so o que AINDA NAO foi gerado (prequiz sempre conta como nao gerado).
  const existing = new Set(existingKinds);
  const [selected, setSelected] = useState(
    () => new Set(KIND_OPTIONS.filter((o) => !(MATERIAL_KEYS.has(o.key) && existing.has(o.key))).map((o) => o.key)),
  );
  // Quando reabrir pra outra aula (muda lessonPrefix), recalcula os nao-gerados.
  useEffect(() => {
    const ex = new Set(existingKinds);
    setSelected(new Set(KIND_OPTIONS.filter((o) => !(MATERIAL_KEYS.has(o.key) && ex.has(o.key))).map((o) => o.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonPrefix, open]);
  const [niche, setNiche] = useState("");
  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [podcastRunning, setPodcastRunning] = useState(false);
  const [progress, setProgress] = useState({ running: new Set(), done: [], errors: [] });
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

  // Gera UM material DeepSeek e devolve o resultado normalizado { kind, ok, ... }.
  // (O podcast tem fluxo proprio em handleGenerate: roteiro + audio.)
  const runOne = async (kind) => {
    const instr = instruction.trim();
    try {
      if (kind === "prequiz") {
        // Pre-quiz salva no DB (lesson_prequestions), nao em arquivo.
        const out = await generatePrequestions({ courseTitle, lessonPrefix, model, instruction: instr });
        return { kind, ok: true, file: `${out.questions.length} perguntas no DB`, usage: out.usage, model: out.model };
      }
      const out = await generateIa({ courseTitle, lessonPrefix, kinds: [kind], model, instruction: instr });
      return out.results?.[0] || { kind, ok: false, error: "falha" };
    } catch (err) {
      return { kind, ok: false, error: err.message || "erro" };
    }
  };

  const handleGenerate = async () => {
    if (selected.size === 0) return;
    const kinds = [...selected];
    setLoading(true);
    setError(null);
    setProgress({ running: new Set(), done: [], errors: [] });

    const allResults = [];
    const record = (res) => {
      allResults.push(res);
      setProgress((p) =>
        res.ok
          ? { ...p, done: [...p.done, res] }
          : { ...p, errors: [...p.errors, res] },
      );
    };

    // Podcast em 2 passos: (1) ROTEIRO no DeepSeek primeiro — feito antes da
    // cadeia de materiais pra nao competir na API (foge do rate limit); depois
    // (2) o AUDIO no Chatterbox (GPU local) roda EM PARALELO com os materiais.
    const hasPodcast = kinds.includes("podcast");
    const serialKinds = kinds.filter((k) => k !== "podcast");

    let audioPromise = null;
    if (hasPodcast) {
      setPodcastRunning(true);
      try {
        const script = await generatePodcastScript({ courseTitle, lessonPrefix, model });
        audioPromise = generatePodcastAudio({ courseTitle, lessonPrefix, title: script.title, turns: script.turns, model })
          .then((out) => ({ kind: "podcast", ok: true, file: `${out.turns} falas — ${out.title}` }))
          .catch((err) => ({ kind: "podcast", ok: false, error: err.message || "erro" }));
      } catch (err) {
        // Falha no roteiro: nem chega no Chatterbox.
        record({ kind: "podcast", ok: false, error: err.message || "erro (roteiro)" });
        setPodcastRunning(false);
      }
    }

    // Materiais DeepSeek em paralelo (teto KIND_CONCURRENCY).
    await runPool(serialKinds, KIND_CONCURRENCY, async (kind) => {
      setProgress((p) => ({ ...p, running: new Set(p.running).add(kind) }));
      const res = await runOne(kind);
      record(res);
      setProgress((p) => {
        const r = new Set(p.running);
        r.delete(kind);
        return { ...p, running: r };
      });
    });

    if (audioPromise) {
      record(await audioPromise);
      setPodcastRunning(false);
    }

    setLoading(false);
    onGenerated?.({ results: allResults });
  };

  const handleClose = () => {
    if (loading) return;
    setProgress({ running: new Set(), done: [], errors: [] });
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
                const alreadyGen = MATERIAL_KEYS.has(opt.key) && existing.has(opt.key);
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
                    {alreadyGen && (
                      <span className="text-[10px] uppercase tracking-wide text-emerald-400/80 mr-1">ja gerado</span>
                    )}
                    <span
                      className={`w-4 h-4 rounded border-2 ${
                        on ? "bg-current border-current" : "border-slate-600"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Nicho/instrucao — OPCIONAL aqui (diferente do curso de leitura). */}
            <label className="block text-xs text-slate-400 mb-1">Instrucao / nicho <span className="text-slate-600">(opcional)</span></label>
            <select
              value={niche}
              onChange={(e) => {
                const key = e.target.value;
                setNiche(key);
                const preset = INSTRUCTION_PRESETS.find((p) => p.key === key);
                setInstruction(preset ? preset.text : "");
              }}
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-slate-200 text-sm mb-2 focus:outline-none focus:border-blue-500/40"
            >
              <option value="">Sem instrucao extra</option>
              {INSTRUCTION_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            {niche && (
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={4}
                className="w-full bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-2 text-slate-200 text-sm mb-4 resize-y focus:outline-none focus:border-blue-500/40"
              />
            )}

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
                // O podcast roda em paralelo (GPU local), entao fica "gerando..."
                // junto com a cadeia DeepSeek ate resolver.
                const isCurrent =
                  progress.running?.has(kind) ||
                  (kind === "podcast" && podcastRunning && !done && !err);
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
