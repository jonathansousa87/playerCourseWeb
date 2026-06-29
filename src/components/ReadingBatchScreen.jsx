import React, { useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookOpenText, ChevronDown, ChevronRight, Loader2, Check,
  AlertTriangle, X, Sparkles, SlidersHorizontal, Mic, Cpu, Cloud,
} from "lucide-react";
import { INSTRUCTION_PRESETS } from "../utils/instructionPresets";
import { collectModules, generateReadingCourseBatch, MATERIAL_KINDS } from "../utils/readingGeneration";
import { clearPrecondenseCache } from "../utils/progressApi";

const MODELS = [
  { key: "deepseek-v4-flash", label: "deepseek-v4-flash (rapido)" },
  { key: "deepseek-v4-pro", label: "deepseek-v4-pro (raciocina mais)" },
];

// Fases globais do lote (revezam a VRAM no backend: WhisperX -> Qwen -> DeepSeek).
const PHASES = {
  whisper: { label: "Transcrevendo (WhisperX)", Icon: Mic, color: "text-sky-300" },
  qwen: { label: "Condensando aulas (Qwen)", Icon: Cpu, color: "text-violet-300" },
  deepseek: { label: "Gerando leitura (Qwen + DeepSeek), módulo a módulo", Icon: Cloud, color: "text-emerald-300" },
  materials: { label: "Gerando materiais (IA)", Icon: Sparkles, color: "text-amber-300" },
  done: { label: "Concluido", Icon: Check, color: "text-emerald-400" },
  cancelled: { label: "Cancelado", Icon: X, color: "text-slate-400" },
  error: { label: "Erro", Icon: AlertTriangle, color: "text-red-400" },
};

// Barra de progresso simples (done/total), com parte de falhas em ambar.
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

// Chip da "linha de baixo": resume uma opcao escolhida no menu de cima.
const Chip = ({ label, value, danger }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border whitespace-nowrap ${
    danger ? "border-rose-500/50 text-rose-300 bg-rose-500/5" : "border-slate-700 text-slate-300 bg-slate-800/50"
  }`}>
    <span className="text-slate-500">{label}:</span>
    <span className="font-medium">{value}</span>
  </span>
);

// Tela de geracao de curso de leitura EM LOTE.
// Topo: barra horizontal de configuracao (menu com checkboxes) + linha-resumo.
// Abaixo: duas colunas — cursos/modulos | processamento (por modulo).
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
  const [preCondense, setPreCondense] = useState(true); // Qwen por aula — ligado por padrao
  const [genMaterials, setGenMaterials] = useState(true);
  // Podcast desmarcado por padrao (gere sob demanda quando quiser); os demais on.
  const [materialKinds, setMaterialKinds] = useState(() => new Set(MATERIAL_KINDS.map((k) => k.key).filter((k) => k !== "podcast")));

  // UI: paineis do topo
  const [matMenuOpen, setMatMenuOpen] = useState(false);
  const [showInstruction, setShowInstruction] = useState(false);

  const [cacheMsg, setCacheMsg] = useState("");
  const handleClearCache = async () => {
    if (!window.confirm("Limpar o cache da pré-condensação (Qwen)? Na próxima geração ele recondensa do zero (mais lento e gasta GPU).")) return;
    setCacheMsg("limpando…");
    try { await clearPrecondenseCache(); setCacheMsg("cache do Qwen limpo"); }
    catch (e) { setCacheMsg(`falhou: ${e.message}`); }
    setTimeout(() => setCacheMsg(""), 5000);
  };

  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState(null);
  const [fatalError, setFatalError] = useState("");
  const [prog, setProg] = useState({}); // prog[courseTitle] = { order:[paths], modules:{[path]:{...}} }
  const cancelRef = useRef(false);
  const abortRef = useRef(null);

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
  const materialsOk = !genMaterials || materialKinds.size > 0;
  const canGenerate = !running && !!niche && totalSelected > 0 && materialsOk;

  const nicheLabel = INSTRUCTION_PRESETS.find((p) => p.key === niche)?.label || "";
  const chosenKinds = MATERIAL_KINDS.filter((k) => materialKinds.has(k.key)).map((k) => k.label);

  // Custo DeepSeek (USD): por modulo (leitura + materiais) e total do lote.
  const moduleCost = (m) => (m?.cost || 0) + (m?.materialsCost || 0);
  const fmtUSD = (n) => `$${n >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
  const totalCost = Object.values(prog).reduce(
    (s, cp) => s + Object.values(cp.modules || {}).reduce((a, m) => a + moduleCost(m), 0),
    0,
  );

  // Atualiza UM modulo (chaveado por courseTitle + modulePath).
  const patchModule = (courseTitle, path, fn) =>
    setProg((p) => {
      const c = p[courseTitle];
      if (!c || !c.modules[path]) return p;
      return { ...p, [courseTitle]: { ...c, modules: { ...c.modules, [path]: fn(c.modules[path]) } } };
    });

  const onEvent = (ev) => {
    if (ev.kind === "phase") {
      if (ev.status === "start") setPhase(ev.phase);
      return;
    }
    const { courseTitle, modulePath } = ev;
    if (!courseTitle || !modulePath) return;

    if (ev.kind === "module-transcribe") {
      patchModule(courseTitle, modulePath, (m) => ({
        ...m,
        note: ev.status === "start" ? "transcrevendo (WhisperX)…" : ev.transcribed ? `transcrito (+${ev.transcribed})` : "transcrito",
      }));
    } else if (ev.kind === "module-precondense") {
      patchModule(courseTitle, modulePath, (m) => ({ ...m, note: ev.status === "start" ? "condensando (Qwen)…" : "condensado (Qwen)" }));
    } else if (ev.kind === "module-start") {
      patchModule(courseTitle, modulePath, (m) => ({ ...m, status: "doing", note: "gerando leitura…" }));
    } else if (ev.kind === "reading") {
      patchModule(courseTitle, modulePath, (m) => ({ ...m, reading: { total: ev.total, done: 0, fail: 0 } }));
    } else if (ev.kind === "reading-lesson") {
      patchModule(courseTitle, modulePath, (m) => {
        const r = m.reading || { total: 0, done: 0, fail: 0 };
        if (ev.status === "ok") return { ...m, reading: { ...r, done: r.done + 1 } };
        if (ev.status === "fail") return { ...m, reading: { ...r, done: r.done + 1, fail: r.fail + 1 } };
        return m;
      });
    } else if (ev.kind === "module-done") {
      patchModule(courseTitle, modulePath, (m) => {
        const r = ev.result || {};
        const errors = [];
        for (const c of r.created || []) if (!c.ok) errors.push(`Aula "${c.title}": ${c.error || "falhou"}`);
        // transcription.failed = falha REAL do WhisperX. `skipped` (sem WHISPERX_BIN
        // ou modo Drive) NAO e problema: a leitura sai das transcricoes existentes.
        for (const f of r.transcription?.failed || []) errors.push(`Transcricao "${f.file}": ${f.error || "falhou"}`);
        if (r.skipped) errors.push(String(r.skipped));
        return {
          ...m,
          status: errors.length ? "warn" : "done",
          note: "",
          originalLessons: r.originalLessons ?? null,
          condensedLessons: (r.created || []).length,
          cost: r.cost || 0, // custo da leitura (plano + condensacao)
          errors: [...(m.errors || []), ...errors],
        };
      });
    } else if (ev.kind === "module-cost") {
      patchModule(courseTitle, modulePath, (m) => ({ ...m, materialsCost: ev.materialsCost || 0 }));
    } else if (ev.kind === "module-error") {
      patchModule(courseTitle, modulePath, (m) => ({ ...m, status: "error", note: "", errors: [...(m.errors || []), ev.error || "erro"] }));
    } else if (ev.kind === "materials-init") {
      patchModule(courseTitle, modulePath, (m) => ({ ...m, materials: { total: ev.total, done: 0, fail: 0 } }));
    } else if (ev.kind === "material") {
      patchModule(courseTitle, modulePath, (m) => {
        const mat = m.materials || { total: 0, done: 0, fail: 0 };
        if (ev.status === "ok") return { ...m, materials: { ...mat, done: mat.done + 1 } };
        if (ev.status === "fail") return { ...m, materials: { ...mat, done: mat.done + 1, fail: mat.fail + 1 } };
        return m;
      });
    } else if (ev.kind === "materials-errors") {
      patchModule(courseTitle, modulePath, (m) => ({
        ...m,
        status: m.status === "error" ? "error" : "warn",
        errors: [...(m.errors || []), ...(ev.errors || []).map((e) => `Material — ${e}`)],
      }));
    }
  };

  const handleGenerateAll = async () => {
    if (!canGenerate) return;
    setStarted(true);
    setRunning(true);
    setMatMenuOpen(false);
    setFatalError("");
    setPhase(null);
    cancelRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    // Pre-popula a coluna de processamento com todos os modulos selecionados.
    const initial = {};
    for (const c of courses) {
      const sel = selectedModules[c.title] || new Set();
      const order = (modulesByCourse[c.title] || []).filter((m) => sel.has(m.path));
      if (!order.length) continue;
      initial[c.title] = {
        order: order.map((m) => m.path),
        modules: Object.fromEntries(order.map((m) => [m.path, {
          title: m.title, status: "queue", note: "", reading: null, materials: null,
          errors: [], originalLessons: null, condensedLessons: null, cost: 0, materialsCost: 0,
        }])),
      };
    }
    setProg(initial);

    try {
      await generateReadingCourseBatch({
        courses, modulesByCourse, selectedModules,
        model, instruction, autoTranscribe, language, preCondense,
        genMaterials, materialKinds: [...materialKinds],
        cancelRef, signal: controller.signal,
        onProgress: onEvent,
      });
      setPhase(cancelRef.current ? "cancelled" : "done");
    } catch (err) {
      if (controller.signal.aborted || cancelRef.current) setPhase("cancelled");
      else { setFatalError(err.message); setPhase("error"); }
    }
    setRunning(false);
  };

  const handleCancel = () => {
    cancelRef.current = true;
    try { abortRef.current?.abort(); } catch { /* noop */ }
  };

  // ---- estilos compartilhados do toolbar ----
  const ctl = "h-9 rounded-lg bg-slate-800/70 border text-sm px-2.5 disabled:opacity-50";
  const checkBtn = (on) =>
    `inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm border ${
      on ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "border-slate-700 text-slate-400 hover:bg-slate-800/60"
    }`;
  const Box = ({ on }) => (
    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${on ? "bg-emerald-500 border-emerald-500" : "border-slate-600"}`}>
      {on && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
    </span>
  );

  const ph = phase ? PHASES[phase] : null;

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

      {/* ===== Barra de configuracao (horizontal, menu com checkboxes) ===== */}
      <div className="border-b border-slate-800/60 px-6 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />

          {/* Nicho (obrigatorio) */}
          <select
            value={niche}
            disabled={running}
            onChange={(e) => {
              setNiche(e.target.value);
              const p = INSTRUCTION_PRESETS.find((x) => x.key === e.target.value);
              setInstruction(p ? p.text : "");
            }}
            className={`${ctl} ${niche ? "border-slate-700" : "border-rose-500/60"}`}
            title="Nicho (obrigatorio)"
          >
            <option value="">— Nicho (obrigatorio) —</option>
            {INSTRUCTION_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>

          {niche && (
            <button onClick={() => setShowInstruction((v) => !v)} disabled={running} className={ctl + " border-slate-700 text-slate-300 hover:bg-slate-800/60"}>
              Instrucao {showInstruction ? "▲" : "▼"}
            </button>
          )}

          {/* Idioma do curso original (Auto = detecta PT/EN por aula) */}
          <div className="inline-flex h-9 rounded-lg border border-slate-700 overflow-hidden">
            {["pt", "en", "auto"].map((l) => (
              <button
                key={l}
                disabled={running}
                onClick={() => setLanguage(l)}
                className={`px-3 text-sm ${language === l ? "bg-emerald-500/15 text-emerald-200" : "text-slate-400 hover:bg-slate-800/60"}`}
                title={l === "auto" ? "Detecta automaticamente PT ou EN em cada aula" : ""}
              >
                {l === "pt" ? "Portugues" : l === "en" ? "Ingles" : "Auto"}
              </button>
            ))}
          </div>

          {/* Qwen por aula (default on) */}
          <button onClick={() => setPreCondense((v) => !v)} disabled={running} className={checkBtn(preCondense)} title="Condensa cada aula no modelo local (Qwen) antes do DeepSeek. A app revezar a VRAM com o WhisperX automaticamente.">
            <Box on={preCondense} /> <Sparkles className="w-3.5 h-3.5" /> Condensar (Qwen)
          </button>

          {/* Transcrever faltantes */}
          <button onClick={() => setAutoTranscribe((v) => !v)} disabled={running} className={checkBtn(autoTranscribe)} title="Transcreve via WhisperX apenas as aulas que ainda nao tem .txt">
            <Box on={autoTranscribe} /> Transcrever faltantes
          </button>

          {/* Materiais (menu com checkboxes) */}
          <div className="relative">
            <button
              onClick={() => setMatMenuOpen((v) => !v)}
              disabled={running}
              className={`${ctl} inline-flex items-center gap-2 ${genMaterials && !materialsOk ? "border-rose-500/60" : "border-slate-700"} text-slate-300 hover:bg-slate-800/60`}
            >
              <Box on={genMaterials} /> Materiais
              <span className="text-slate-500">{genMaterials ? `(${materialKinds.size})` : "(off)"}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {matMenuOpen && (
              <>
                <div className="fixed inset-0 z-[1]" onClick={() => setMatMenuOpen(false)} />
                <div className="absolute z-[2] mt-1 w-60 rounded-xl border border-slate-700 bg-slate-900 shadow-xl p-2">
                  <label className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-200 cursor-pointer rounded-lg hover:bg-slate-800/60">
                    <input type="checkbox" checked={genMaterials} disabled={running} onChange={(e) => setGenMaterials(e.target.checked)} className="accent-emerald-500" />
                    Gerar materiais (IA)
                  </label>
                  <div className="my-1 border-t border-slate-800" />
                  {MATERIAL_KINDS.map((k) => {
                    const on = materialKinds.has(k.key);
                    return (
                      <button
                        key={k.key}
                        disabled={running || !genMaterials}
                        onClick={() => toggleKind(k.key)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm text-slate-300 hover:bg-slate-800/60 disabled:opacity-40"
                      >
                        <Box on={on && genMaterials} /> {k.label}
                      </button>
                    );
                  })}
                  {genMaterials && !materialsOk && (
                    <div className="px-2 pt-1 text-[11px] text-rose-400">Escolha ao menos um material.</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Modelo (default v4-flash) */}
          <select value={model} disabled={running} onChange={(e) => setModel(e.target.value)} className={ctl + " border-slate-700"}>
            {MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>

          <div className="flex-1" />

          <button
            onClick={handleClearCache}
            disabled={running}
            title="Limpa o cache em disco da pré-condensação do Qwen (.precondense-cache). Use se quiser recondensar do zero."
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800/60 text-xs disabled:opacity-40"
          >
            <Cpu className="w-3.5 h-3.5" /> Limpar cache Qwen
          </button>
          {cacheMsg && <span className="text-[11px] text-slate-400">{cacheMsg}</span>}

          {started && (
            <span
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-200 text-sm tabular-nums"
              title="Custo estimado DeepSeek do lote: leitura (plano + condensacao) + materiais (pratica/quiz/flashcards/diario + prequiz + roteiro do podcast). Entrada+saida com cache. Soma a cada modulo processado."
            >
              <Cloud className="w-3.5 h-3.5" /> DeepSeek ~{fmtUSD(totalCost)}
            </span>
          )}

          {running && (
            <button onClick={handleCancel} className="h-9 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
              Cancelar
            </button>
          )}
          <button
            onClick={handleGenerateAll}
            disabled={!canGenerate}
            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? "Gerando..." : `Gerar tudo (${totalSelected})`}
          </button>
        </div>

        {/* Instrucao (editavel) — abre full-width */}
        {niche && showInstruction && (
          <textarea
            value={instruction}
            disabled={running}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
            className="w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm resize-y disabled:opacity-50"
          />
        )}

        {/* Linha-resumo: opcoes escolhidas, na horizontal */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip label="Nicho" value={nicheLabel || "—"} danger={!niche} />
          <Chip label="Idioma" value={language === "pt" ? "Portugues" : language === "en" ? "Ingles" : "Auto (detecta)"} />
          <Chip label="Qwen" value={preCondense ? "sim" : "nao"} />
          <Chip label="Transcrever" value={autoTranscribe ? "faltantes" : "nao"} />
          <Chip
            label="Materiais"
            value={genMaterials ? (chosenKinds.length ? chosenKinds.join(", ") : "nenhum") : "off"}
            danger={genMaterials && !materialsOk}
          />
          <Chip label="Modelo" value={model.replace("deepseek-", "")} />
          <Chip label="Modulos" value={String(totalSelected)} danger={totalSelected === 0} />
        </div>
      </div>

      {/* ===== Duas colunas: cursos/modulos | processamento ===== */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
        {/* Cursos + modulos */}
        <div className="overflow-y-auto p-4 space-y-2 lg:border-r border-slate-800/60">
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
                      // Resultado do processamento deste modulo (se ja rodou).
                      const pm = prog[c.title]?.modules?.[m.path];
                      const tip = (pm?.errors || []).join("\n");
                      return (
                        <button
                          key={m.path}
                          onClick={() => toggleModule(c.title, m.path)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs ${
                            on ? "bg-emerald-500/10 text-emerald-200" : "text-slate-400 hover:bg-slate-800/60"
                          }`}
                        >
                          <Box on={on} />
                          <span className="flex-1 min-w-0 truncate" title={m.title}>{m.title}</span>
                          {pm?.condensedLessons != null && (
                            <span className="text-[10px] tabular-nums text-slate-400 whitespace-nowrap" title="aulas originais → aulas de leitura">
                              {pm.originalLessons != null ? `${pm.originalLessons}→` : ""}{pm.condensedLessons}
                            </span>
                          )}
                          {moduleCost(pm) > 0 && (
                            <span className="text-[10px] tabular-nums text-emerald-300/90 whitespace-nowrap" title="Custo DeepSeek do modulo">
                              {fmtUSD(moduleCost(pm))}
                            </span>
                          )}
                          {pm?.status === "done" && <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                          {(pm?.errors || []).length > 0 && (
                            <span className="flex-shrink-0 cursor-help" title={tip}>
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Processamento */}
        <div className="overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-slate-500">Processamento</div>
            {ph && (
              <div className={`inline-flex items-center gap-1.5 text-[11px] ${ph.color}`}>
                {running && phase !== "done" && phase !== "cancelled" && phase !== "error"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ph.Icon className="w-3.5 h-3.5" />}
                {ph.label}
              </div>
            )}
          </div>

          {fatalError && <div className="text-[12px] text-red-300 border border-red-500/30 bg-red-500/5 rounded-lg px-3 py-2">{fatalError}</div>}

          {!started ? (
            <div className="text-sm text-slate-500 py-8 text-center">Configure no topo e clique em Gerar tudo.</div>
          ) : (
            courses.filter((c) => prog[c.title]).map((c) => {
              const cp = prog[c.title];
              return (
                <div key={c.title} className="border border-slate-700/40 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex-1 min-w-0 truncate text-sm font-medium" title={c.title}>{c.title}</span>
                    <span className="text-[11px] text-slate-500">{cp.order.length} modulo(s)</span>
                  </div>
                  <div className="space-y-2">
                    {cp.order.map((path) => {
                      const m = cp.modules[path];
                      const hasErr = (m.errors || []).length > 0;
                      const tip = (m.errors || []).join("\n");
                      return (
                        <div key={path} className="rounded-lg border border-slate-800/70 bg-slate-900/40 px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            {m.status === "queue" && <span className="w-3 h-3 rounded-full bg-slate-600 flex-shrink-0" />}
                            {m.status === "doing" && <Loader2 className="w-3 h-3 animate-spin text-blue-400 flex-shrink-0" />}
                            {m.status === "done" && <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                            {(m.status === "warn" || m.status === "error") && (
                              <span className="flex-shrink-0 cursor-help" title={tip}>
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                              </span>
                            )}
                            <span className="flex-1 min-w-0 truncate text-[12px] text-slate-300" title={m.title}>{m.title}</span>
                            {m.condensedLessons != null && (
                              <span className="text-[11px] tabular-nums text-slate-400 whitespace-nowrap">
                                {m.originalLessons != null ? `${m.originalLessons} → ` : ""}{m.condensedLessons} aulas
                              </span>
                            )}
                            {moduleCost(m) > 0 && (
                              <span className="text-[11px] tabular-nums text-emerald-300/90 whitespace-nowrap" title="Custo DeepSeek do modulo (leitura + materiais)">
                                {fmtUSD(moduleCost(m))}
                              </span>
                            )}
                            {hasErr && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 cursor-help" title={tip}>
                                {m.errors.length} problema(s)
                              </span>
                            )}
                          </div>
                          {m.note && m.status !== "done" && m.status !== "warn" && m.status !== "error" && (
                            <div className="mt-1 text-[10px] text-slate-500">{m.note}</div>
                          )}
                          {m.reading && m.status === "doing" && (
                            <div className="mt-1.5"><div className="text-[10px] text-slate-500 mb-0.5">Leitura</div><Bar {...m.reading} /></div>
                          )}
                          {m.materials && (
                            <div className="mt-1.5"><div className="text-[10px] text-slate-500 mb-0.5">Materiais</div><Bar {...m.materials} /></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
