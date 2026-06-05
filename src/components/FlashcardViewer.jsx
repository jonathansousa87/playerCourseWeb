import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchFlashcardDeck,
  importFlashcardDeck,
  reviewFlashcard,
} from "../utils/progressApi";
import WhyErrorOverlay from "./WhyErrorOverlay";
import { LoadingState, ErrorState } from "./StateViews";

const RATINGS = [
  { rating: 1, label: "Errei", key: "1", color: "red", helper: "Nao lembrei" },
  { rating: 2, label: "Dificil", key: "2", color: "amber", helper: "Lembrei com esforco" },
  { rating: 3, label: "Bom", key: "3", color: "emerald", helper: "Lembrei normal" },
  { rating: 4, label: "Facil", key: "4", color: "sky", helper: "Instantaneo" },
];

const RATING_STYLES = {
  red: "bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-300",
  amber: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300",
  emerald: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300",
  sky: "bg-sky-500/20 hover:bg-sky-500/30 border-sky-500/40 text-sky-300",
};

const isDue = (card, now = new Date()) => {
  if (!card.due) return true; // nunca revisado
  return new Date(card.due) <= now;
};

// Ordena a sessao: due primeiro (mais atrasados), depois os novos.
const orderForSession = (cards) => {
  const now = new Date();
  const due = cards.filter((c) => isDue(c, now));
  const future = cards.filter((c) => !isDue(c, now));
  due.sort((a, b) => new Date(a.due || 0) - new Date(b.due || 0));
  return [...due, ...future];
};

const FlashcardViewer = ({ courseTitle, lessonPrefix }) => {
  const [allCards, setAllCards] = useState([]);
  const [sessionQueue, setSessionQueue] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState("loading"); // loading | ready | empty | error
  const [errorMsg, setErrorMsg] = useState("");
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [showSummary, setShowSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Card que o usuario acabou de errar — mostra overlay com botao "Por que errei?"
  // antes de avancar pro proximo (Mullet & Butler 2022).
  const [erroredCard, setErroredCard] = useState(null);
  // Confianca declarada antes do flip (Metcalfe 2017): 'high' | 'medium' | 'low'
  const [confidence, setConfidence] = useState(null);

  const loadDeck = useCallback(async () => {
    setStatus("loading");
    try {
      let deck = await fetchFlashcardDeck(courseTitle, lessonPrefix);
      if (!deck) {
        await importFlashcardDeck(courseTitle, lessonPrefix);
        deck = await fetchFlashcardDeck(courseTitle, lessonPrefix);
      }
      if (!deck || !deck.cards.length) {
        setStatus("empty");
        return;
      }
      const ordered = orderForSession(deck.cards);
      setAllCards(deck.cards);
      setSessionQueue(ordered);
      setCurrentIdx(0);
      setFlipped(false);
      setStats({ again: 0, hard: 0, good: 0, easy: 0 });
      setShowSummary(false);
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Erro desconhecido");
      setStatus("error");
    }
  }, [courseTitle, lessonPrefix]);

  useEffect(() => {
    if (courseTitle && lessonPrefix) loadDeck();
  }, [courseTitle, lessonPrefix, loadDeck]);

  const dueCount = useMemo(
    () => sessionQueue.filter((c) => isDue(c)).length,
    [sessionQueue],
  );

  const current = sessionQueue[currentIdx];

  const advance = useCallback(() => {
    setFlipped(false);
    setConfidence(null);
    if (currentIdx + 1 >= sessionQueue.length) {
      setShowSummary(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }, [currentIdx, sessionQueue.length]);

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
        // Rating "Errei" suspende o avanco e abre o overlay com botao
        // "Por que errei?". O avanco acontece quando o user clica pular/proximo.
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
      // Overlay de erro tem seus proprios botoes — nao processa atalhos por baixo.
      if (showSummary || erroredCard) return;
      // Pre-flip: J/K/L pra capturar confidence (low/medium/high), depois flip auto.
      if (!flipped && !confidence) {
        if (e.key === "j" || e.key === "J") { e.preventDefault(); setConfidence("low"); setFlipped(true); return; }
        if (e.key === "k" || e.key === "K") { e.preventDefault(); setConfidence("medium"); setFlipped(true); return; }
        if (e.key === "l" || e.key === "L") { e.preventDefault(); setConfidence("high"); setFlipped(true); return; }
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        // So permite virar de volta apos confidence ja capturado
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
  }, [flipped, showSummary, erroredCard, confidence, submitRating]);

  if (status === "loading") {
    return <LoadingState message="Carregando flashcards..." />;
  }

  if (status === "error") {
    return (
      <ErrorState
        message={errorMsg || "Erro ao carregar flashcards."}
        onRetry={loadDeck}
      />
    );
  }

  if (status === "empty") {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-lg">Nenhum flashcard encontrado</div>
      </div>
    );
  }

  if (showSummary) {
    const total = stats.again + stats.hard + stats.good + stats.easy;
    const accuracy =
      total > 0
        ? Math.round(((stats.good + stats.easy) / total) * 100)
        : 0;
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="max-w-md w-full mx-4">
          <div className="bg-slate-800 rounded-2xl p-8 text-center border border-slate-700 shadow-2xl">
            <div className="text-6xl mb-4">
              {accuracy >= 80 ? "Excelente" : accuracy >= 50 ? "Bom" : "Continue"}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Sessao finalizada</h2>
            <div className="text-5xl font-bold text-blue-400 mb-4">{accuracy}%</div>
            <div className="grid grid-cols-4 gap-3 mb-6 text-sm">
              <div>
                <div className="text-xl font-bold text-red-400">{stats.again}</div>
                <div className="text-slate-500">Errei</div>
              </div>
              <div>
                <div className="text-xl font-bold text-amber-400">{stats.hard}</div>
                <div className="text-slate-500">Dificil</div>
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-400">{stats.good}</div>
                <div className="text-slate-500">Bom</div>
              </div>
              <div>
                <div className="text-xl font-bold text-sky-400">{stats.easy}</div>
                <div className="text-slate-500">Facil</div>
              </div>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              O FSRS programou a proxima revisao de cada card com base nas suas
              respostas. Cards dificeis voltam logo; cards faceis so em dias/semanas.
            </p>
            <button
              onClick={loadDeck}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium"
            >
              Recomecar sessao
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = ((currentIdx + 1) / sessionQueue.length) * 100;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-900 px-4">
      <div className="w-full max-w-lg mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">
            Card {currentIdx + 1} de {sessionQueue.length}
          </span>
          <span className="text-xs text-slate-500">
            {dueCount} vencido{dueCount === 1 ? "" : "s"} / {allCards.length} total
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
        className="w-full max-w-lg select-none"
        onClick={() => {
          // So permite virar manualmente apos declarar confianca
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
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                flipped
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {flipped ? "RESPOSTA" : "PERGUNTA"}
            </span>
            {current?.reps > 0 && (
              <span className="text-[10px] text-slate-500 font-mono">
                rep {current.reps} | lapses {current.lapses}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center h-full min-h-[280px] p-8 pt-14">
            <p
              className={`text-center text-lg leading-relaxed whitespace-pre-wrap ${
                flipped ? "text-blue-100" : "text-slate-100"
              }`}
            >
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

      {erroredCard && (
        <WhyErrorOverlay
          courseTitle={courseTitle}
          lessonPrefix={lessonPrefix}
          card={erroredCard}
          onContinue={handleContinueAfterError}
        />
      )}
    </div>
  );
};

// Captura de confianca antes do flip (Metcalfe 2017 / hypercorrection).
// Errar com 'high' = embaraco produtivo, fixa muito mais.
const CONFIDENCE_OPTIONS = [
  { key: "low", label: "Nao sei", helper: "(J)", color: "rose" },
  { key: "medium", label: "Mais ou menos", helper: "(K)", color: "amber" },
  { key: "high", label: "Sei", helper: "(L)", color: "emerald" },
];

const CONFIDENCE_STYLES = {
  rose: "bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-200",
  amber: "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-200",
  emerald: "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-200",
};

export const ConfidenceButtons = ({ value, onSelect }) => (
  <>
    <span className="text-[11px] text-slate-500 uppercase tracking-wider">
      Voce sabe a resposta?
    </span>
    <div className="flex items-center gap-2 flex-wrap justify-center">
      {CONFIDENCE_OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            className={`flex flex-col items-center gap-0.5 px-5 py-2 border rounded-xl transition-colors ${
              active ? CONFIDENCE_STYLES[opt.color] + " ring-2 ring-current/40" : CONFIDENCE_STYLES[opt.color]
            }`}
          >
            <span className="text-sm font-medium">{opt.label}</span>
            <span className="text-[10px] opacity-60">{opt.helper}</span>
          </button>
        );
      })}
    </div>
  </>
);

export default FlashcardViewer;
