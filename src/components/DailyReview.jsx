import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDueFlashcards,
  fetchFlashcardSummary,
  fetchConfusionGroups,
  reviewFlashcard,
} from "../utils/progressApi";
import { buildSessionQueue } from "../utils/sessionOrdering";
import WhyErrorOverlay from "./WhyErrorOverlay";
import { ConfidenceButtons } from "./FlashcardViewer";

const INTERLEAVE_PREF_KEY = "dailyReview.interleaveMode";

const RATINGS = [
  { rating: 1, label: "Errei", key: "1", color: "red", helper: "Nao lembrei" },
  { rating: 2, label: "Dificil", key: "2", color: "amber", helper: "Com esforco" },
  { rating: 3, label: "Bom", key: "3", color: "emerald", helper: "Normal" },
  { rating: 4, label: "Facil", key: "4", color: "sky", helper: "Instantaneo" },
];

const RATING_STYLES = {
  red: "bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-300",
  amber: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300",
  emerald: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300",
  sky: "bg-sky-500/20 hover:bg-sky-500/30 border-sky-500/40 text-sky-300",
};

const DailyReview = ({ onBack }) => {
  const [queue, setQueue] = useState([]);
  const [summary, setSummary] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Card recem-errado — overlay com botao "Por que errei?" suspende o avanco.
  const [erroredCard, setErroredCard] = useState(null);
  const [confidence, setConfidence] = useState(null);
  // Interleaving forcado (Brunmair & Richter 2019). Default ON. Salvo
  // em localStorage pra persistir entre sessoes.
  const [interleaveMode, setInterleaveMode] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(INTERLEAVE_PREF_KEY);
    return v == null ? true : v === "true";
  });
  // Numero de cursos distintos na queue (pra esconder toggle quando = 1)
  const [distinctCourses, setDistinctCourses] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INTERLEAVE_PREF_KEY, String(interleaveMode));
    }
  }, [interleaveMode]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [dueRes, sum, confusion] = await Promise.all([
        fetchDueFlashcards({ limit: 100 }),
        fetchFlashcardSummary(),
        fetchConfusionGroups({ minLapses: 2, threshold: 0.4 }).catch(() => null),
      ]);
      const cards = Array.isArray(dueRes) ? dueRes : dueRes?.cards || [];
      setSummary(sum || []);
      if (cards.length === 0) {
        setStatus("empty");
        setDistinctCourses(0);
        return;
      }

      // IDs de cards em algum grupo de confusao semantica (Brunmair: similarity
      // matters — cards parecidos interleaved consolidam mais).
      const confusionIds = new Set();
      if (confusion?.groups) {
        for (const g of confusion.groups) {
          for (const c of g.cards || []) confusionIds.add(c.id);
        }
      }

      const courseSet = new Set(cards.map((c) => c.course_title));
      setDistinctCourses(courseSet.size);

      // Aplica interleaving + confusion priority quando o modo esta ON e ha
      // mais de 1 curso. Caso contrario, mantem o sort por due_date do backend.
      const ordered =
        interleaveMode && courseSet.size > 1
          ? buildSessionQueue(cards, confusionIds)
          : cards;

      setQueue(ordered);
      setIdx(0);
      setFlipped(false);
      setStats({ again: 0, hard: 0, good: 0, easy: 0 });
      setDone(false);
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Erro desconhecido");
      setStatus("error");
    }
  }, [interleaveMode]);

  useEffect(() => {
    load();
  }, [load]);

  const current = queue[idx];
  const totalDue = useMemo(
    () => summary.reduce((acc, r) => acc + (r.due || 0), 0),
    [summary],
  );

  const advance = useCallback(() => {
    setFlipped(false);
    setConfidence(null);
    if (idx + 1 >= queue.length) setDone(true);
    else setIdx((i) => i + 1);
  }, [idx, queue.length]);

  const submitRating = useCallback(
    async (rating) => {
      if (!current || submitting) return;
      setSubmitting(true);
      try {
        await reviewFlashcard(current.id, rating, confidence);
        setStats((prev) => {
          const key = ["", "again", "hard", "good", "easy"][rating];
          return { ...prev, [key]: prev[key] + 1 };
        });
        if (rating === 1) {
          setErroredCard(current);
        } else {
          advance();
        }
      } catch (err) {
        console.error("Erro ao salvar review:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [current, submitting, advance, confidence],
  );

  const handleContinueAfterError = useCallback(() => {
    setErroredCard(null);
    advance();
  }, [advance]);

  useEffect(() => {
    const handleKey = (e) => {
      if (done || status !== "ready" || erroredCard) return;
      // Pre-flip: J/K/L pra capturar confidence
      if (!flipped && !confidence) {
        if (e.key === "j" || e.key === "J") { e.preventDefault(); setConfidence("low"); setFlipped(true); return; }
        if (e.key === "k" || e.key === "K") { e.preventDefault(); setConfidence("medium"); setFlipped(true); return; }
        if (e.key === "l" || e.key === "L") { e.preventDefault(); setConfidence("high"); setFlipped(true); return; }
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (confidence) setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        submitRating(Number(e.key));
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [flipped, done, status, erroredCard, confidence, submitRating]);

  const header = (
    <div className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="w-full px-6 lg:px-10 xl:px-14 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
            title="Voltar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-100 leading-tight">
              Revisao diaria
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {totalDue} card{totalDue === 1 ? "" : "s"} vencido{totalDue === 1 ? "" : "s"} no total
            </p>
          </div>
        </div>
        {distinctCourses > 1 && (
          <label
            className="flex items-center gap-2 text-xs cursor-pointer select-none px-3 py-1.5 rounded-lg border border-slate-700/40 hover:bg-slate-800/60 transition"
            title="Alterna cards de cursos diferentes em vez de seguir por curso (Brunmair 2019)"
          >
            <input
              type="checkbox"
              checked={interleaveMode}
              onChange={(e) => setInterleaveMode(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-slate-300">Modo intercalado</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${interleaveMode ? "bg-purple-500/20 text-purple-300" : "bg-slate-700/60 text-slate-500"}`}>
              {interleaveMode ? "ON" : "OFF"}
            </span>
          </label>
        )}
      </div>
    </div>
  );

  const summaryPanel = summary.length > 0 && (
    <div className="w-full px-6 lg:px-10 xl:px-14 pt-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {summary.map((r) => (
          <div
            key={r.course_title}
            className="bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 flex items-center justify-between"
          >
            <span className="text-sm text-slate-300 truncate pr-2" title={r.course_title}>
              {r.course_title}
            </span>
            <span className="text-xs font-mono whitespace-nowrap">
              <span className="text-amber-300">{r.due}</span>
              <span className="text-slate-500"> / {r.total}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {header}
        <div className="flex items-center justify-center py-20 text-slate-400">Carregando...</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {header}
        <div className="max-w-md mx-auto text-center py-20">
          <div className="text-lg text-red-400 mb-2">Erro ao carregar</div>
          <div className="text-sm text-slate-500 mb-4">{errorMsg}</div>
          <button
            onClick={load}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {header}
        {summaryPanel}
        <div className="max-w-md mx-auto text-center py-16">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-lg text-slate-200 mb-1">Nenhum card vencido</div>
          <div className="text-sm text-slate-500">
            Volte mais tarde — o FSRS vai reagendar revisoes conforme o tempo passa.
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    const total = stats.again + stats.hard + stats.good + stats.easy;
    const accuracy = total > 0 ? Math.round(((stats.good + stats.easy) / total) * 100) : 0;
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {header}
        <div className="max-w-md mx-auto px-4 py-10">
          <div className="bg-slate-800 rounded-2xl p-8 text-center border border-slate-700 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-2">Sessao finalizada</h2>
            <div className="text-5xl font-bold text-blue-400 mb-4">{accuracy}%</div>
            <div className="grid grid-cols-4 gap-3 mb-6 text-sm">
              <div><div className="text-xl font-bold text-red-400">{stats.again}</div><div className="text-slate-500">Errei</div></div>
              <div><div className="text-xl font-bold text-amber-400">{stats.hard}</div><div className="text-slate-500">Dificil</div></div>
              <div><div className="text-xl font-bold text-emerald-400">{stats.good}</div><div className="text-slate-500">Bom</div></div>
              <div><div className="text-xl font-bold text-sky-400">{stats.easy}</div><div className="text-slate-500">Facil</div></div>
            </div>
            <button
              onClick={load}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium"
            >
              Buscar mais cards
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = ((idx + 1) / queue.length) * 100;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {header}
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
            <span>Card {idx + 1} de {queue.length}</span>
            <span className="truncate ml-2" title={current.course_title}>
              {current.course_title}
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div
          className="select-none"
          onClick={() => {
            if (confidence) setFlipped((f) => !f);
          }}
          style={{ cursor: confidence ? "pointer" : "default" }}
        >
          <div
            className={`relative min-h-[280px] rounded-2xl border-2 transition-all duration-500 shadow-2xl ${
              flipped
                ? "bg-gradient-to-br from-blue-900/40 to-blue-800/40 border-blue-500/40"
                : "bg-gradient-to-br from-gray-800 to-gray-800/80 border-slate-600/40 hover:border-gray-500/60"
            }`}
          >
            <div className="absolute top-4 left-4">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  flipped ? "bg-blue-500/20 text-blue-300" : "bg-slate-700 text-slate-400"
                }`}
              >
                {flipped ? "RESPOSTA" : "PERGUNTA"}
              </span>
            </div>
            <div className="flex items-center justify-center h-full min-h-[280px] p-8 pt-14">
              <p className={`text-center text-lg leading-relaxed whitespace-pre-wrap ${
                flipped ? "text-blue-100" : "text-slate-100"
              }`}>
                {flipped ? current.back : current.front}
              </p>
            </div>
            {!flipped && confidence && (
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <span className="text-xs text-slate-500">
                  Clique ou pressione Espaco para virar
                </span>
              </div>
            )}
            {!flipped && !confidence && (
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <span className="text-xs text-yellow-400/80">
                  Declare sua confianca primeiro (botoes abaixo)
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 mt-6">
          {flipped ? (
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {RATINGS.map((r) => (
                <button
                  key={r.rating}
                  onClick={() => submitRating(r.rating)}
                  disabled={submitting}
                  className={`flex flex-col items-center gap-0.5 px-5 py-2 border rounded-xl transition-colors disabled:opacity-50 ${RATING_STYLES[r.color]}`}
                >
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="text-[10px] opacity-70">
                    {r.helper} ({r.key})
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <ConfidenceButtons
              value={confidence}
              onSelect={(c) => { setConfidence(c); setFlipped(true); }}
            />
          )}
        </div>
      </div>

      {erroredCard && (
        <WhyErrorOverlay
          courseTitle={erroredCard.course_title}
          lessonPrefix={erroredCard.lesson_prefix}
          card={erroredCard}
          onContinue={handleContinueAfterError}
        />
      )}
    </div>
  );
};

export default DailyReview;
