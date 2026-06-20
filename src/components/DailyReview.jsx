import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDueFlashcards,
  fetchFlashcardSummary,
  reviewFlashcard,
  fetchMaterialsByKind,
} from "../utils/progressApi";
import { ArrowLeft, Layers, FileText, ChevronRight } from "lucide-react";
import WhyErrorOverlay from "./WhyErrorOverlay";
import { ConfidenceButtons } from "./FlashcardViewer";
import TechnicalDiary from "./TechnicalDiary";
import { API_BASE } from "../config";

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

const enc = encodeURIComponent;

// ============ Sessao de revisao espacada de UM curso ============
const CardReview = ({ courseTitle }) => {
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState("loading");
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [erroredCard, setErroredCard] = useState(null);
  const [confidence, setConfidence] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const dueRes = await fetchDueFlashcards({ courseTitle, limit: 100 });
      const cards = Array.isArray(dueRes) ? dueRes : dueRes?.cards || [];
      setQueue(cards);
      setIdx(0);
      setFlipped(false);
      setConfidence(null);
      setStats({ again: 0, hard: 0, good: 0, easy: 0 });
      setDone(false);
      setStatus(cards.length === 0 ? "empty" : "ready");
    } catch {
      setStatus("error");
    }
  }, [courseTitle]);

  useEffect(() => { load(); }, [load]);

  const current = queue[idx];

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
        if (rating === 1) setErroredCard(current);
        else advance();
      } catch (err) {
        console.error("Erro ao salvar review:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [current, submitting, advance, confidence],
  );

  useEffect(() => {
    const handleKey = (e) => {
      if (done || status !== "ready" || erroredCard) return;
      if (!flipped && !confidence) {
        if (e.key.toLowerCase() === "j") { e.preventDefault(); setConfidence("low"); setFlipped(true); return; }
        if (e.key.toLowerCase() === "k") { e.preventDefault(); setConfidence("medium"); setFlipped(true); return; }
        if (e.key.toLowerCase() === "l") { e.preventDefault(); setConfidence("high"); setFlipped(true); return; }
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

  if (status === "loading") return <div className="py-20 text-center text-slate-400">Carregando...</div>;
  if (status === "error") return <div className="py-20 text-center text-red-400">Erro ao carregar os cards.</div>;

  if (status === "empty") {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-4xl mb-3">🎉</div>
        <div className="text-lg text-slate-200 mb-1">Nenhum card vencido neste curso</div>
        <div className="text-sm text-slate-500">O FSRS reagenda as revisoes conforme o tempo passa.</div>
      </div>
    );
  }

  if (done) {
    const total = stats.again + stats.hard + stats.good + stats.easy;
    const accuracy = total > 0 ? Math.round(((stats.good + stats.easy) / total) * 100) : 0;
    return (
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
          <button onClick={load} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium">
            Buscar mais cards
          </button>
        </div>
      </div>
    );
  }

  const progress = ((idx + 1) / queue.length) * 100;
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
          <span>Card {idx + 1} de {queue.length}</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div
        className="select-none"
        onClick={() => { if (confidence) setFlipped((f) => !f); }}
        style={{ cursor: confidence ? "pointer" : "default" }}
      >
        <div className={`relative min-h-[280px] rounded-2xl border-2 transition-all duration-500 shadow-2xl ${
          flipped
            ? "bg-gradient-to-br from-blue-900/40 to-blue-800/40 border-blue-500/40"
            : "bg-gradient-to-br from-gray-800 to-gray-800/80 border-slate-600/40 hover:border-gray-500/60"
        }`}>
          <div className="absolute top-4 left-4">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${flipped ? "bg-blue-500/20 text-blue-300" : "bg-slate-700 text-slate-400"}`}>
              {flipped ? "RESPOSTA" : "PERGUNTA"}
            </span>
          </div>
          <div className="flex items-center justify-center h-full min-h-[280px] p-8 pt-14">
            <p className={`text-center text-lg leading-relaxed whitespace-pre-wrap ${flipped ? "text-blue-100" : "text-slate-100"}`}>
              {flipped ? current.back : current.front}
            </p>
          </div>
          {!flipped && (
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <span className={`text-xs ${confidence ? "text-slate-500" : "text-yellow-400/80"}`}>
                {confidence ? "Clique ou pressione Espaco para virar" : "Declare sua confianca primeiro (botoes abaixo)"}
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
                <span className="text-[10px] opacity-70">{r.helper} ({r.key})</span>
              </button>
            ))}
          </div>
        ) : (
          <ConfidenceButtons value={confidence} onSelect={(c) => { setConfidence(c); setFlipped(true); }} />
        )}
      </div>

      {erroredCard && (
        <WhyErrorOverlay
          courseTitle={erroredCard.course_title}
          lessonPrefix={erroredCard.lesson_prefix}
          card={erroredCard}
          onContinue={() => { setErroredCard(null); advance(); }}
        />
      )}
    </div>
  );
};

// ============ Aba: diarios tecnicos do curso ============
const DiarioTab = ({ courseTitle }) => {
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchMaterialsByKind(courseTitle, "diario")
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setItems(list);
        setSelected(list[0]?.lesson_prefix || null);
      })
      .catch(() => setItems([]));
  }, [courseTitle]);

  if (!items) return <div className="py-20 text-center text-slate-400">Carregando diarios...</div>;
  if (items.length === 0) {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium mb-1">Nenhum diario tecnico gerado</p>
        <p className="text-sm text-slate-500">Gere o diario de uma aula pelo botao Gerar IA (opcao Diario) que ele aparece aqui.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 h-[calc(100vh-180px)]">
      <aside className="w-60 flex-shrink-0 border-r border-slate-700/40 overflow-y-auto p-2 space-y-1">
        {items.map((it) => {
          const active = selected === it.lesson_prefix;
          return (
            <button
              key={it.lesson_prefix}
              onClick={() => setSelected(it.lesson_prefix)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                active ? "bg-rose-500/15 text-rose-200 border border-rose-500/25" : "text-slate-300 hover:bg-slate-800/80 border border-transparent"
              }`}
              title={it.lesson_prefix}
            >
              {it.lesson_prefix}
            </button>
          );
        })}
      </aside>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {selected && (
          <TechnicalDiary
            key={selected}
            courseTitle={courseTitle}
            lessonPrefix={selected}
            templateUrl={`${API_BASE}/api/materials/${enc(courseTitle)}/${enc(selected)}/diario`}
          />
        )}
      </div>
    </div>
  );
};

// ============ Tela principal: lista de cursos -> abas ============
const DailyReview = ({ onBack }) => {
  const [summary, setSummary] = useState(null);
  const [course, setCourse] = useState(null);
  const [tab, setTab] = useState("review");

  useEffect(() => {
    fetchFlashcardSummary().then((s) => setSummary(s || [])).catch(() => setSummary([]));
  }, []);

  const totalDue = useMemo(
    () => (summary || []).reduce((acc, r) => acc + (r.due || 0), 0),
    [summary],
  );

  // ---- Lista de cursos ----
  if (!course) {
    const courses = (summary || [])
      .slice()
      .sort((a, b) => (b.due || 0) - (a.due || 0));
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="border-b border-slate-800/60 bg-slate-900/50 sticky top-0 z-10">
          <div className="w-full px-6 lg:px-10 py-4 flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Voltar">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-100 leading-tight">Revisao espacada</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                {totalDue} card{totalDue === 1 ? "" : "s"} vencido{totalDue === 1 ? "" : "s"} no total — escolha um curso
              </p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-3xl mx-auto px-6 py-8">
          {summary === null ? (
            <div className="text-center text-slate-400 py-16">Carregando...</div>
          ) : courses.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🗂️</div>
              <div className="text-slate-300">Nenhum curso com flashcards ainda.</div>
              <div className="text-sm text-slate-500 mt-1">Gere flashcards de uma aula pelo botao Gerar IA.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {courses.map((c) => (
                <button
                  key={c.course_title}
                  onClick={() => { setCourse(c.course_title); setTab("review"); }}
                  className="w-full flex items-center gap-3 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/40 rounded-xl px-4 py-3 text-left transition-colors"
                >
                  <Layers className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  <span className="flex-1 text-slate-200 truncate" title={c.course_title}>{c.course_title}</span>
                  {c.due > 0 ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                      {c.due} pra revisar
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">em dia</span>
                  )}
                  <span className="text-[11px] text-slate-500 font-mono">{c.total} cards</span>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Curso selecionado: abas ----
  const TABS = [
    { key: "review", label: "Revisao espacada", Icon: Layers },
    { key: "diario", label: "Diario tecnico", Icon: FileText },
  ];
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800/60 bg-slate-900/50 sticky top-0 z-10">
        <div className="w-full px-6 lg:px-10 py-4 flex items-center gap-4">
          <button onClick={() => setCourse(null)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Voltar aos cursos">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-slate-100 leading-tight truncate flex-1" title={course}>{course}</h2>
        </div>
        <div className="w-full px-6 lg:px-10 flex gap-1">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                  on ? "border-blue-500 text-blue-300" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <t.Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "review" ? <CardReview courseTitle={course} /> : <DiarioTab courseTitle={course} />}
    </div>
  );
};

export default DailyReview;
