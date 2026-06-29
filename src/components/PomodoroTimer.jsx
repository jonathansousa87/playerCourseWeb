import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  savePomodoroSession,
  fetchRecentStats,
  fetchDueFlashcards,
  reviewFlashcard,
} from "../utils/progressApi";

const DEFAULT_FOCUS = 25 * 60;
const BREAK_DURATION = 5 * 60;

// Acerto 7d -> duracao de foco sugerida.
// < 60% = ruim, 20min pra nao cansar mais. > 85% = confortavel, 45min deep work.
const adaptiveFocusSeconds = (accuracy7d) => {
  if (accuracy7d == null) return DEFAULT_FOCUS;
  if (accuracy7d < 0.6) return 20 * 60;
  if (accuracy7d > 0.85) return 45 * 60;
  return DEFAULT_FOCUS;
};

const RATINGS = [
  { rating: 1, label: "Errei", color: "bg-red-500/20 border-red-500/40 text-red-300" },
  { rating: 2, label: "Dificil", color: "bg-amber-500/20 border-amber-500/40 text-amber-300" },
  { rating: 3, label: "Bom", color: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" },
  { rating: 4, label: "Facil", color: "bg-sky-500/20 border-sky-500/40 text-sky-300" },
];

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.5);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.5);
    });
  } catch {
    // ignora erro de AudioContext (browsers sem suporte ou bloqueio de autoplay)
  }
};

const PomodoroTimer = ({ isVideoPlaying, onPauseVideo, courseTitle, autoStart = false, bottomOffset = 12, align = "center", rightOffset = 12 }) => {
  const [focusDuration, setFocusDuration] = useState(DEFAULT_FOCUS);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_FOCUS);
  const [isRunning, setIsRunning] = useState(false);
  // phase: focus | choose_break | break_active | break_passive | summary
  const [phase, setPhase] = useState("focus");
  const [sessions, setSessions] = useState(0);
  const [summaryText, setSummaryText] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCards, setActiveCards] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeFlipped, setActiveFlipped] = useState(false);
  const [activeReviewed, setActiveReviewed] = useState(0);
  const [lastKind, setLastKind] = useState("reflection");
  const intervalRef = useRef(null);
  const startedRef = useRef(false);

  // Ao montar: busca accuracy 7d pra ajustar duracao do foco.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await fetchRecentStats();
        if (cancelled) return;
        const dur = adaptiveFocusSeconds(stats?.accuracy7d);
        setFocusDuration(dur);
        setTimeLeft((prev) => (startedRef.current ? prev : dur));
      } catch {
        // mantem default
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-start: quando o video toca (aulas de video) OU quando `autoStart` (aulas
  // de leitura, que nao tem video) — assim o Pomodoro tambem roda na leitura.
  useEffect(() => {
    if ((isVideoPlaying || autoStart) && phase === "focus" && !startedRef.current) {
      startedRef.current = true;
      setIsRunning(true);
    }
  }, [isVideoPlaying, autoStart]);

  // Timer tick
  useEffect(() => {
    if (isRunning && phase !== "summary") {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            handleTimerEnd();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, phase]);

  const handleTimerEnd = useCallback(() => {
    playNotificationSound();
    setIsRunning(false);

    if (phase === "focus") {
      onPauseVideo?.();
      setSessions((s) => s + 1);
      setPhase("choose_break");
      setTimeLeft(BREAK_DURATION);
    } else if (phase === "break_passive" || phase === "break_active") {
      setPhase("summary");
      setSummaryText("");
    }
  }, [phase, onPauseVideo]);

  const handleSaveSummary = async () => {
    if (!summaryText.trim()) {
      resetToFocus();
      return;
    }
    setSaving(true);
    try {
      if (courseTitle) {
        await savePomodoroSession(courseTitle, summaryText.trim(), null, lastKind);
      }
    } catch (e) {
      console.error("Erro ao salvar reflexao:", e);
    }
    setSaving(false);
    resetToFocus();
  };

  const resetToFocus = () => {
    setPhase("focus");
    setTimeLeft(focusDuration);
    setSummaryText("");
    setActiveCards([]);
    setActiveIdx(0);
    setActiveFlipped(false);
    setActiveReviewed(0);
    setLastKind("reflection");
    startedRef.current = true;
    setIsRunning(true);
  };

  const startActiveBreak = useCallback(async () => {
    try {
      const res = await fetchDueFlashcards({ limit: 5 });
      const cards = Array.isArray(res) ? res : res?.cards || [];
      setActiveCards(cards);
      setActiveIdx(0);
      setActiveFlipped(false);
      setActiveReviewed(0);
    } catch (err) {
      console.error("Erro carregando cards ativos:", err);
      setActiveCards([]);
    }
    setLastKind("break_active");
    setPhase("break_active");
    setTimeLeft(BREAK_DURATION);
    setIsRunning(true);
  }, []);

  const startPassiveBreak = useCallback(() => {
    setLastKind("break_passive");
    setPhase("break_passive");
    setTimeLeft(BREAK_DURATION);
    setIsRunning(true);
  }, []);

  const submitActiveRating = useCallback(
    async (rating) => {
      const card = activeCards[activeIdx];
      if (!card) return;
      try {
        await reviewFlashcard(card.id, rating);
      } catch (err) {
        console.error("Erro ao salvar review ativa:", err);
      }
      setActiveReviewed((n) => n + 1);
      setActiveFlipped(false);
      if (activeIdx + 1 >= activeCards.length) {
        setPhase("summary");
      } else {
        setActiveIdx((i) => i + 1);
      }
    },
    [activeCards, activeIdx],
  );

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = phase === "focus"
    ? ((focusDuration - timeLeft) / focusDuration) * 100
    : ((BREAK_DURATION - timeLeft) / BREAK_DURATION) * 100;

  // Summary popup
  if (phase === "summary") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-emerald-500/15 rounded-xl flex items-center justify-center text-emerald-400 text-sm font-bold border border-emerald-500/20">
              +{sessions}
            </div>
            <div>
              <h3 className="text-slate-100 font-semibold">Pausa concluida!</h3>
              <p className="text-slate-500 text-xs">Resumo rapido do que aprendeu</p>
            </div>
          </div>
          <textarea
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
            placeholder="O que ficou de mais importante nessa sessao de estudo?"
            className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 resize-none text-sm leading-relaxed"
            rows={4}
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={resetToFocus}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
            >
              Pular
            </button>
            <button
              onClick={handleSaveSummary}
              disabled={saving}
              className="px-5 py-2 bg-emerald-600/90 hover:bg-emerald-500/90 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/10"
            >
              {saving ? "Salvando..." : "Salvar e continuar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Choose break type
  if (phase === "choose_break") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md p-6">
          <h3 className="text-slate-100 font-semibold mb-1">Hora da pausa</h3>
          <p className="text-slate-500 text-xs mb-5">
            Recall ativo fixa o que voce acabou de estudar. Escolhe como quer pausar.
          </p>
          <div className="space-y-3">
            <button
              onClick={startActiveBreak}
              className="w-full text-left px-4 py-3 bg-cyan-600/15 hover:bg-cyan-600/25 border border-cyan-500/30 rounded-xl transition-all"
            >
              <div className="text-cyan-200 font-medium">🔁 Revisar 5 cards</div>
              <div className="text-xs text-cyan-400/70 mt-0.5">
                Pausa ativa — reforca memoria de longo prazo
              </div>
            </button>
            <button
              onClick={startPassiveBreak}
              className="w-full text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-xl transition-all"
            >
              <div className="text-slate-200 font-medium">😌 Pausa passiva</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Levanta, hidrata, descansa os olhos
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active break: mini FSRS review
  if (phase === "break_active") {
    const card = activeCards[activeIdx];
    if (!card) {
      return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="text-slate-300 mb-4">Nenhum card vencido agora.</div>
            <button
              onClick={() => setPhase("summary")}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm"
            >
              Continuar
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
            <span>Pausa ativa — card {activeIdx + 1} de {activeCards.length}</span>
            <span className="font-mono">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
          </div>
          <div
            className={`rounded-xl border-2 p-6 min-h-[180px] flex items-center justify-center cursor-pointer transition-all ${
              activeFlipped
                ? "bg-cyan-900/20 border-cyan-500/40"
                : "bg-slate-800/60 border-slate-700/50"
            }`}
            onClick={() => setActiveFlipped((f) => !f)}
          >
            <p className="text-center text-slate-100 whitespace-pre-wrap">
              {activeFlipped ? card.back : card.front}
            </p>
          </div>
          <div className="mt-4">
            {activeFlipped ? (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {RATINGS.map((r) => (
                  <button
                    key={r.rating}
                    onClick={() => submitActiveRating(r.rating)}
                    className={`px-4 py-2 border rounded-xl text-sm ${r.color}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setActiveFlipped(true)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium"
              >
                Virar card
              </button>
            )}
          </div>
          <div className="text-center mt-3 text-[11px] text-slate-500">
            {activeReviewed} revisados · tempo ate o foco voltar
          </div>
        </div>
      </div>
    );
  }

  // Passive break countdown
  if (phase === "break_passive") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl shadow-2xl w-72 p-6 text-center">
          <div className="text-emerald-400 text-sm font-medium mb-3">Pausa - Descanse os olhos</div>
          <div className="relative w-24 h-24 mx-auto mb-4">
            <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-800" />
              <circle
                cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress / 100)}`}
                strokeLinecap="round" className="text-emerald-400"
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-2xl font-bold text-emerald-400">
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </span>
            </div>
          </div>
          <p className="text-slate-500 text-xs">Levante, estique, hidrate-se</p>
        </div>
      </div>
    );
  }

  // Focus bar - compact
  return (
    <div
      style={align === "right" ? { bottom: `${bottomOffset}px`, right: `${rightOffset}px` } : { bottom: `${bottomOffset}px`, left: "50%", transform: "translateX(-50%)" }}
      className="fixed z-[60] flex items-center gap-3 bg-slate-900/95 border border-slate-700/40 rounded-full px-4 py-1.5 shadow-xl backdrop-blur-sm"
    >
      {/* Progress bar */}
      <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      {/* Time */}
      <span className="font-mono text-xs text-slate-300 tabular-nums w-10 text-center">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
      {/* Status dot */}
      {isRunning && (
        <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
      )}
      {/* Session count */}
      {sessions > 0 && (
        <span className="text-[10px] text-slate-500 font-medium">{sessions}x</span>
      )}
    </div>
  );
};

export default PomodoroTimer;
