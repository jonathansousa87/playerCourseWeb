import React, { useState } from "react";
import { ArrowLeft, Keyboard, CheckCircle2, Circle, Armchair, ChevronRight, FolderOpen } from "lucide-react";
import TypingTrainer from "./TypingTrainer";
import TypingIntro from "./TypingIntro";
import {
  TYPING_STAGES,
  TYPING_LESSONS,
  TYPING_TOTAL,
  TYPING_PASS_ACCURACY,
  TYPING_WPM_TIERS,
  wpmTier,
} from "../../typing/curriculum";

// Tela do curso de digitacao. Navegacao em 3 niveis (estilo home):
//   pastas (estagios) -> licoes do estagio -> treino.
const TypingCourse = ({ progress, saveResult, completedCount, onBack }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [showIntro, setShowIntro] = useState(false);
  const [stageIdx, setStageIdx] = useState(null);

  const overallPct = TYPING_TOTAL > 0 ? Math.round((completedCount / TYPING_TOTAL) * 100) : 0;

  const selectedIndex = TYPING_LESSONS.findIndex((l) => l.id === selectedId);
  const selectedLesson = selectedIndex >= 0 ? TYPING_LESSONS[selectedIndex] : null;
  const nextLesson =
    selectedIndex >= 0 && selectedIndex < TYPING_LESSONS.length - 1
      ? TYPING_LESSONS[selectedIndex + 1]
      : null;

  const stageStats = (stage) => {
    const total = stage.lessons.length;
    const done = stage.lessons.filter((l) => progress[l.id]?.completed).length;
    const tiers = { bad: 0, fair: 0, good: 0 };
    for (const l of stage.lessons) {
      const t = wpmTier(progress[l.id]?.bestWpm);
      if (t) tiers[t.key] += 1;
    }
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0, tiers };
  };

  const openLesson = (id) => setSelectedId(id);

  const goNext = () => {
    if (!nextLesson) return;
    setSelectedId(nextLesson.id);
    const si = TYPING_STAGES.findIndex((s) => s.stage === nextLesson.stage);
    if (si >= 0) setStageIdx(si);
  };

  // ── Modo treino ──────────────────────────────────────────────────────────
  if (selectedLesson) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">
        <TypingTrainer
          key={selectedLesson.id}
          lesson={selectedLesson}
          best={progress[selectedLesson.id]}
          hasNext={!!nextLesson}
          onFinish={(res) => saveResult(selectedLesson.id, res)}
          onNext={goNext}
          onExit={() => setSelectedId(null)}
        />
      </div>
    );
  }

  // ── Introducao de postura ───────────────────────────────────────────────
  if (showIntro) {
    return (
      <TypingIntro
        onBack={() => setShowIntro(false)}
        onStart={() => {
          setShowIntro(false);
          setStageIdx(0);
          if (TYPING_LESSONS[0]) setSelectedId(TYPING_LESSONS[0].id);
        }}
      />
    );
  }

  // ── Nivel 2: licoes de uma pasta (estagio) ───────────────────────────────
  if (stageIdx != null && TYPING_STAGES[stageIdx]) {
    const stage = TYPING_STAGES[stageIdx];
    const { total, done, pct } = stageStats(stage);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
        <header className="border-b border-slate-800/60 sticky top-0 z-10 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full px-6 lg:px-10 xl:px-14 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setStageIdx(null)}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/40 text-slate-200 text-xs font-medium transition flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" /> Pastas
              </button>
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
                <FolderOpen className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-slate-100 leading-tight truncate">{stage.stage}</h1>
                {stage.subtitle && <p className="text-xs text-slate-400 truncate">{stage.subtitle}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-cyan-400">{pct}%</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{done}/{total} licoes</div>
              </div>
            </div>
          </div>
        </header>

        <main className="w-full px-6 lg:px-10 xl:px-14 py-6 space-y-5">
          <WpmLegend />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
            {stage.lessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                p={progress[lesson.id]}
                onClick={() => openLesson(lesson.id)}
              />
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Nivel 1: pastas (estagios) em grade de largura total ──────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 sticky top-0 z-10 bg-slate-900/60 backdrop-blur-sm">
        <div className="w-full px-6 lg:px-10 xl:px-14 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/40 text-slate-200 text-xs font-medium transition flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0">
              <Keyboard className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-slate-100 leading-tight">Curso de Digitacao</h1>
              <p className="text-xs text-slate-400">
                Touch typing em PT-BR (ABNT2) · precisao minima de {TYPING_PASS_ACCURACY}% para concluir
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-bold text-cyan-400">{overallPct}%</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                {completedCount}/{TYPING_TOTAL} licoes
              </div>
            </div>
          </div>
          <div className="mt-3 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-10 xl:px-14 py-6 space-y-6">
        {/* Introducao de postura — sempre acessivel no topo */}
        <button
          onClick={() => setShowIntro(true)}
          className="w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl border border-cyan-500/25 bg-gradient-to-r from-cyan-600/15 to-blue-600/10 hover:border-cyan-500/50 transition-all"
        >
          <div className="p-2.5 rounded-xl bg-cyan-500/15 flex-shrink-0">
            <Armchair className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-100">Comece aqui: postura e posicao das maos</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Como sentar, altura da tela, pulsos e onde apoiar cada dedo — com ilustracoes.
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-cyan-400 flex-shrink-0" />
        </button>

        {/* Grade de pastas (um card por modulo/estagio) ocupando a tela toda */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {TYPING_STAGES.map((stage, si) => {
            const { total, done, pct, tiers } = stageStats(stage);
            const complete = total > 0 && done === total;
            return (
              <button
                key={si}
                onClick={() => setStageIdx(si)}
                className={`group text-left relative bg-slate-800/70 rounded-2xl border p-5 h-full flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20 ${
                  complete ? "border-emerald-700/40 hover:border-emerald-600/60" : "border-slate-700/40 hover:border-cyan-600/50"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2.5 rounded-xl bg-cyan-500/15">
                      <FolderOpen className="w-5 h-5 text-cyan-400" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">#{si + 1}</span>
                  </div>
                  {complete && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                </div>
                <h3 className="text-base font-semibold text-slate-100 leading-snug mb-1 line-clamp-2">
                  {stage.stage}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 flex-grow">
                  {stage.subtitle}
                </p>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>{done}/{total} licoes</span>
                    <span className={complete ? "text-emerald-400 font-medium" : "text-cyan-400 font-medium"}>{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        complete ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-cyan-500 to-blue-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* Contagem de licoes por faixa de WPM (vermelho/laranja/verde) */}
                  <div className="flex items-center gap-3 mt-2.5">
                    {TYPING_WPM_TIERS.map((t) => (
                      <span
                        key={t.key}
                        title={`${t.label} (${t.range}): ${tiers[t.key]} licao(oes)`}
                        className="flex items-center gap-1 text-[11px] font-semibold tabular-nums"
                        style={{ color: t.color, opacity: tiers[t.key] > 0 ? 1 : 0.35 }}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                        {tiers[t.key]}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
};

// Legenda das faixas de WPM (a marca de cada licao segue essas cores).
const WpmLegend = () => (
  <div className="flex items-center flex-wrap gap-x-4 gap-y-2 px-1">
    <span className="text-xs text-slate-400">Cor da marca (WPM):</span>
    {TYPING_WPM_TIERS.map((t) => (
      <span key={t.key} className="flex items-center gap-1.5 text-xs text-slate-300">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
        {t.label} <span className="text-slate-500">{t.range}</span>
      </span>
    ))}
  </div>
);

// Card de uma licao dentro da pasta. Marca: check verde = concluida (>=95%);
// borda/numero coloridos = faixa de WPM do recorde.
const LessonRow = ({ lesson, p, onClick }) => {
  const done = !!p?.completed;
  const tier = p ? wpmTier(p.bestWpm) : null;
  return (
    <button
      onClick={onClick}
      style={tier ? { borderLeft: `4px solid ${tier.color}` } : undefined}
      title={tier ? `Marca de velocidade: ${tier.label} (${p.bestWpm} WPM)` : undefined}
      className={`text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
        done
          ? "bg-emerald-950/20 border-emerald-700/30 hover:border-emerald-600/50"
          : "bg-slate-800/50 border-slate-700/40 hover:border-cyan-600/40 hover:bg-slate-800/80"
      }`}
    >
      <div className="flex-shrink-0">
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        ) : (
          <Circle className="w-5 h-5 text-slate-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-100 truncate">{lesson.title}</div>
        {lesson.focus && lesson.focus.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {lesson.focus.map((f, i) => (
              <span
                key={i}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 border border-slate-600/40"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
      {p && (
        <div className="text-right flex-shrink-0">
          <div
            className="text-xs font-bold tabular-nums flex items-center justify-end gap-1.5"
            style={{ color: tier ? tier.color : "#e2e8f0" }}
          >
            {tier && <span className="w-2 h-2 rounded-full" style={{ background: tier.color }} />}
            {p.bestWpm || 0} WPM
          </div>
          <div className="text-[10px] text-slate-500 tabular-nums">{p.bestAccuracy || 0}%</div>
        </div>
      )}
    </button>
  );
};

export default TypingCourse;
