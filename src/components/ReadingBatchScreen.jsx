import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, ChevronDown, ChevronRight, Loader2, Check, AlertTriangle, X } from "lucide-react";
import { INSTRUCTION_PRESETS } from "../utils/instructionPresets";
import { collectModules, generateCourseReading, MATERIAL_KINDS } from "../utils/readingGeneration";

const MODELS = [
  { key: "deepseek-v4-flash", label: "deepseek-v4-flash (rapido)" },
  { key: "deepseek-v4-pro", label: "deepseek-v4-pro (raciocina mais)" },
];

// Barra de progresso simples (done/total), com parte de falhas em vermelho.
const Bar = ({ done = 0, fail = 0, total = 0 }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
        <div className={`h-full ${fail > 0 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-slate-400">{done}/{total}{fail > 0 ? ` (${fail}!)` : ""}</span>
    </div>
  );
};

// Tela de geracao de curso de leitura em LOTE (3 colunas):
// cursos+modulos | config unica | processamento.
const ReadingBatchScreen = ({ courses, onClose }) => {
  const modulesByCourse = useMemo(() => {
    const m = {};
    for (const c of courses) m[c.title] = collectModules(c.content || []);
    return m;
  }, [courses]);

  const [selectedModules, setSelectedModules] = useState(() => {
    const m = {};
    for (const c of courses) m[c.title] = new Set((modulesByCourse[c.title] || []).map((x) => x.path));
    return m;
  });
  // Quais cursos estao expandidos (varios ao mesmo tempo). Default: TODOS abertos.
  const [expanded, setExpanded] = useState(() => new Set(courses.map((c) => c.title)));
  const toggleExpanded = (title) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(title) ? s.delete(title) : s.add(title);
      return s;
    });

  // Config unica (vale pra todos os cursos)
  const [niche, setNiche] = useState("");
  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [language, setLanguage] = useState("pt");
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [genMaterials, setGenMaterials] = useState(true);
  const [materialKinds, setMaterialKinds] = useState(() => new Set(MATERIAL_KINDS.map((k) => k.key)));

  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [prog, setProg] = useState({});
  const cancelRef = useRef(false);

  const toggleModule = (title, path) =>
    setSelectedModules((prev) => {
      const set = new Set(prev[title]);
      set.has(path) ? set.delete(path) : set.add(path);
      return { ...prev, [title]: set };
    });
  const toggleAllModules = (title, on) =>
    setSelectedModules((prev) => ({
      ...prev,
      [title]: on ? new Set((modulesByCourse[title] || []).map((x) => x.path)) : new Set(),
    }));
  const toggleKind = (key) =>
    setMaterialKinds((prev) => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });

  const totalSelected = courses.reduce((n, c) => n + (selectedModules[c.title]?.size || 0), 0);
  const canGenerate = !running && !!niche && totalSelected > 0;

  const updateProg = (title, ev) =>
    setProg((p) => {
      const cur = { ...(p[title] || {}) };
      if (ev.kind === "module-start") {
        // Novo modulo: avanca o contador e zera as barras (sao do modulo atual).
        cur.currentModule = ev.module;
        cur.moduleIndex = (cur.moduleIndex || 0) + 1;
        cur.reading = null;
        cur.materials = null;
      } else if (ev.kind === "reading") cur.reading = { total: ev.total, done: 0, fail: 0 };
      else if (ev.kind === "reading-lesson") {
        cur.reading = cur.reading || { total: 0, done: 0, fail: 0 };
        if (ev.status === "ok") cur.reading = { ...cur.reading, done: cur.reading.done + 1 };
        else if (ev.status === "fail") cur.reading = { ...cur.reading, done: cur.reading.done + 1, fail: cur.reading.fail + 1 };
      } else if (ev.kind === "materials-init") cur.materials = { total: ev.total, done: 0, fail: 0 };
      else if (ev.kind === "material") {
        cur.materials = cur.materials || { total: 0, done: 0, fail: 0 };
        if (ev.status === "ok") cur.materials = { ...cur.materials, done: cur.materials.done + 1 };
        else if (ev.status === "fail") cur.materials = { ...cur.materials, done: cur.materials.done + 1, fail: cur.materials.fail + 1 };
      }
      return { ...p, [title]: cur };
    });

  const handleGenerateAll = async () => {
    if (!canGenerate) return;
    setStarted(true);
    setRunning(true);
    cancelRef.current = false;
    const initial = {};
    for (const c of courses) initial[c.title] = { status: "queue" };
    setProg(initial);

    for (const course of courses) {
      if (cancelRef.current) break;
      const sel = selectedModules[course.title] || new Set();
      if (sel.size === 0) {
        setProg((p) => ({ ...p, [course.title]: { status: "skipped" } }));
        continue;
      }
      setProg((p) => ({ ...p, [course.title]: { ...p[course.title], status: "running", moduleTotal: sel.size, moduleIndex: 0 } }));
      try {
        await generateCourseReading({
          courseTitle: course.title,
          modules: modulesByCourse[course.title] || [],
          selectedPaths: sel,
          model,
          instruction,
          autoTranscribe,
          language,
          genMaterials,
          materialKinds: [...materialKinds],
          cancelRef,
          onProgress: (ev) => updateProg(course.title, ev),
        });
        setProg((p) => ({ ...p, [course.title]: { ...p[course.title], status: "done" } }));
      } catch (err) {
        setProg((p) => ({ ...p, [course.title]: { ...p[course.title], status: "error", error: err.message } }));
      }
    }
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950 text-slate-100 flex flex-col">
      <header className="flex items-center gap-3 px-6 py-3 border-b border-slate-800/60">
        <button
          onClick={onClose}
          disabled={running}
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/40 text-slate-200 text-xs font-medium disabled:opacity-40"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <BookOpenText className="w-5 h-5 text-emerald-300" />
        <h2 className="font-semibold">Gerar curso de leitura — {courses.length} curso(s)</h2>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3">
        {/* Cursos + modulos (visualmente a 2a coluna via order) */}
        <div className="overflow-y-auto p-4 space-y-2 lg:order-2 lg:border-r border-slate-800/60">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Cursos e modulos</div>
          {courses.map((c) => {
            const mods = modulesByCourse[c.title] || [];
            const sel = selectedModules[c.title] || new Set();
            const open = expanded.has(c.title);
            return (
              <div key={c.title} className="border border-slate-700/40 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpanded(c.title)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-800/50 hover:bg-slate-800/80 text-left"
                >
                  {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="flex-1 min-w-0 truncate text-sm" title={c.title}>{c.title}</span>
                  <span className="text-[11px] text-slate-400">{sel.size}/{mods.length}</span>
                </button>
                {open && (
                  <div className="p-2 space-y-1 bg-slate-900/40">
                    <div className="flex gap-2 px-1 pb-1 text-[11px]">
                      <button onClick={() => toggleAllModules(c.title, true)} className="text-emerald-400 hover:underline">Todos</button>
                      <button onClick={() => toggleAllModules(c.title, false)} className="text-slate-400 hover:underline">Limpar</button>
                    </div>
                    {mods.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-slate-500">Sem modulos com aulas.</div>
                    ) : mods.map((m) => {
                      const on = sel.has(m.path);
                      return (
                        <button
                          key={m.path}
                          onClick={() => toggleModule(c.title, m.path)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs ${
                            on ? "bg-emerald-500/10 text-emerald-200" : "text-slate-400 hover:bg-slate-800/60"
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${on ? "bg-emerald-500 border-emerald-500" : "border-slate-600"}`}>
                            {on && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          </span>
                          <span className="truncate" title={m.title}>{m.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Configuracao (visualmente a 1a coluna via order) */}
        <div className="overflow-y-auto p-4 space-y-4 lg:order-1 lg:border-r border-slate-800/60">
          <div className="text-xs uppercase tracking-wide text-slate-500">Configuracao (vale pra todos)</div>

          <div>
            <label className="text-xs text-slate-400">Nicho <span className="text-rose-400">(obrigatorio)</span></label>
            <select
              value={niche}
              disabled={running}
              onChange={(e) => {
                setNiche(e.target.value);
                const p = INSTRUCTION_PRESETS.find((x) => x.key === e.target.value);
                setInstruction(p ? p.text : "");
              }}
              className={`mt-1 w-full bg-slate-800/70 border rounded-lg px-3 py-2 text-sm disabled:opacity-50 ${niche ? "border-slate-700" : "border-rose-500/50"}`}
            >
              <option value="">— Selecione —</option>
              {INSTRUCTION_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>

          {niche && (
            <textarea
              value={instruction}
              disabled={running}
              onChange={(e) => setInstruction(e.target.value)}
              rows={5}
              className="w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm resize-y disabled:opacity-50"
            />
          )}

          <div>
            <label className="text-xs text-slate-400">Idioma do curso original</label>
            <div className="mt-1 flex gap-2">
              {["pt", "en"].map((l) => (
                <button
                  key={l}
                  disabled={running}
                  onClick={() => setLanguage(l)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${language === l ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "border-slate-700 text-slate-400"}`}
                >
                  {l === "pt" ? "Portugues" : "Ingles"}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={autoTranscribe} disabled={running} onChange={(e) => setAutoTranscribe(e.target.checked)} className="accent-emerald-500" />
            Transcrever aulas sem .txt (WhisperX)
          </label>

          <div className="border border-slate-700/40 rounded-xl p-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={genMaterials} disabled={running} onChange={(e) => setGenMaterials(e.target.checked)} className="accent-emerald-500" />
              Gerar materiais (IA) apos a leitura
            </label>
            {genMaterials && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MATERIAL_KINDS.map((k) => {
                  const on = materialKinds.has(k.key);
                  return (
                    <button
                      key={k.key}
                      disabled={running}
                      onClick={() => toggleKind(k.key)}
                      className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "border-slate-700 text-slate-400"}`}
                    >
                      {k.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-400">Modelo</label>
            <select
              value={model}
              disabled={running}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            >
              {MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>

          {!niche && <div className="text-xs text-amber-400">Escolha o nicho pra liberar.</div>}
          <button
            onClick={handleGenerateAll}
            disabled={!canGenerate}
            className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? "Gerando..." : `Gerar tudo (${totalSelected} modulo(s))`}
          </button>
          {running && (
            <button onClick={() => (cancelRef.current = true)} className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm">
              Cancelar (apos o modulo atual)
            </button>
          )}
        </div>

        {/* Processamento (3a coluna) */}
        <div className="overflow-y-auto p-4 space-y-3 lg:order-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Processamento</div>
          {!started ? (
            <div className="text-sm text-slate-500 py-8 text-center">Configure e clique em Gerar tudo.</div>
          ) : (
            courses.map((c) => {
              const p = prog[c.title] || { status: "queue" };
              return (
                <div key={c.title} className="border border-slate-700/40 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {p.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                    {p.status === "done" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    {p.status === "error" && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                    {p.status === "queue" && <span className="w-3.5 h-3.5 rounded-full bg-slate-600" />}
                    {p.status === "skipped" && <X className="w-3.5 h-3.5 text-slate-500" />}
                    <span className="flex-1 min-w-0 truncate text-sm" title={c.title}>{c.title}</span>
                    <span className="text-[11px] text-slate-500">
                      {p.status === "queue" ? "na fila" : p.status === "skipped" ? "sem modulos" : p.status === "running" ? "gerando" : p.status}
                    </span>
                  </div>
                  {p.currentModule && (p.status === "running" || p.status === "done") && (
                    <div className="text-[11px] text-slate-300 mb-1.5 truncate" title={p.currentModule}>
                      Modulo {p.moduleIndex}/{p.moduleTotal}: <span className="text-slate-400">{p.currentModule}</span>
                    </div>
                  )}
                  {p.reading && (
                    <div className="mb-1">
                      <div className="text-[11px] text-slate-500 mb-0.5">Leitura</div>
                      <Bar {...p.reading} />
                    </div>
                  )}
                  {p.materials && (
                    <div>
                      <div className="text-[11px] text-slate-500 mb-0.5">Materiais</div>
                      <Bar {...p.materials} />
                    </div>
                  )}
                  {p.error && <div className="text-[11px] text-red-300 mt-1">{p.error}</div>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ReadingBatchScreen;
