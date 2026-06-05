import React, { useCallback, useEffect, useMemo, useState } from "react";
import { parseQuiz } from "../utils/quizParser";
import {
  fetchQuizAttempts,
  saveQuizAttempt,
  saveWrongAsFlashcards,
} from "../utils/progressApi";

const PASS_THRESHOLD = 0.7;

const QuizViewer = ({ fileUrl, courseTitle, lessonPrefix, onPass }) => {
  const [questions, setQuestions] = useState([]);
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [answers, setAnswers] = useState({});
  const [history, setHistory] = useState([]);
  const [extraCardsInfo, setExtraCardsInfo] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [rawContent, attempts] = await Promise.all([
        fetch(fileUrl).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        }),
        courseTitle && lessonPrefix
          ? fetchQuizAttempts(courseTitle, lessonPrefix).catch(() => [])
          : Promise.resolve([]),
      ]);
      const parsed = parseQuiz(rawContent);
      if (parsed.length === 0) {
        setStatus("empty");
        return;
      }
      setQuestions(parsed);
      setAnswers({});
      setHistory(attempts || []);
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Erro desconhecido");
      setStatus("error");
    }
  }, [fileUrl, courseTitle, lessonPrefix]);

  useEffect(() => {
    if (fileUrl) load();
  }, [fileUrl, load]);

  const answer = useCallback((qid, optionIdx) => {
    setAnswers((prev) => (prev[qid] ? prev : { ...prev, [qid]: optionIdx }));
  }, []);

  const answeredCount = Object.keys(answers).length;
  const score = useMemo(
    () =>
      questions.reduce((acc, q) => {
        const selected = answers[q.id];
        if (selected == null) return acc;
        return acc + (q.options[selected]?.correct ? 1 : 0);
      }, 0),
    [answers, questions],
  );
  const total = questions.length;
  const finished = total > 0 && answeredCount === total;
  const accuracy = total > 0 ? score / total : 0;
  const passed = finished && accuracy >= PASS_THRESHOLD;

  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    (async () => {
      try {
        if (courseTitle && lessonPrefix) {
          await saveQuizAttempt(courseTitle, lessonPrefix, { score, total });

          const wrongItems = questions
            .filter((q) => {
              const selected = answers[q.id];
              return selected != null && !q.options[selected]?.correct;
            })
            .map((q) => {
              const correctOpt = q.options.find((o) => o.correct);
              const back = [
                `Resposta correta: ${correctOpt?.text || "-"}`,
                q.explanation ? `\n\n${q.explanation}` : "",
              ].join("");
              return { front: q.question, back };
            });

          if (wrongItems.length > 0) {
            try {
              const result = await saveWrongAsFlashcards(
                courseTitle,
                lessonPrefix,
                wrongItems,
              );
              if (!cancelled) setExtraCardsInfo(result);
            } catch (err) {
              console.error("Erro ao salvar cards extras do quiz:", err);
            }
          }
        }
        if (!cancelled && passed && onPass) onPass();
      } catch (err) {
        console.error("Erro ao salvar tentativa:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Carregando quiz...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg text-red-400 mb-2">Erro ao carregar quiz</div>
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
      <div className="flex items-center justify-center h-full text-slate-400">
        Nenhuma questao encontrada
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-950 px-6 lg:px-12 xl:px-20 py-6">
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-slate-400">
              {answeredCount} de {total} respondidas
            </div>
            <div className="w-56 bg-slate-800 rounded-full h-1.5 mt-1">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${(answeredCount / total) * 100}%` }}
              />
            </div>
          </div>
          {finished && (
            <div className={`text-sm font-medium ${passed ? "text-emerald-400" : "text-amber-400"}`}>
              {score}/{total} ({Math.round(accuracy * 100)}%) {passed ? "— Aprovado" : "— Abaixo de 70%"}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="mb-6 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
            <span>Tentativas anteriores:</span>
            {history.slice(0, 5).map((h, i) => {
              const pct = h.total > 0 ? Math.round((h.score / h.total) * 100) : 0;
              const ok = pct >= PASS_THRESHOLD * 100;
              return (
                <span
                  key={i}
                  className={`px-2 py-0.5 rounded border ${
                    ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  }`}
                >
                  {pct}%
                </span>
              );
            })}
          </div>
        )}

        {questions.map((q) => {
          const selected = answers[q.id];
          const answered = selected != null;
          return (
            <div
              key={q.id}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-4"
            >
              <h3 className="text-slate-100 font-medium mb-4">
                {q.id}. {q.question}
              </h3>
              <div className="space-y-2">
                {q.options.map((opt, idx) => {
                  const isSelected = selected === idx;
                  const showAsCorrect = answered && opt.correct;
                  const showAsWrong = answered && isSelected && !opt.correct;
                  const base = "w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors";
                  let cls = "bg-slate-800/40 border-slate-700/50 text-slate-200 hover:bg-slate-700/50";
                  if (showAsCorrect) cls = "bg-emerald-600/20 border-emerald-500/50 text-emerald-100";
                  else if (showAsWrong) cls = "bg-red-600/20 border-red-500/50 text-red-100";
                  else if (answered) cls = "bg-slate-800/20 border-slate-800 text-slate-400";
                  return (
                    <button
                      key={idx}
                      disabled={answered}
                      onClick={() => answer(q.id, idx)}
                      className={`${base} ${cls} disabled:cursor-default`}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
              {answered && q.explanation && (
                <div className="mt-3 text-xs text-slate-400 bg-slate-950/60 border-l-2 border-purple-500/50 pl-3 py-2 rounded">
                  {q.explanation}
                </div>
              )}
            </div>
          );
        })}

        {finished && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div>
                <div className="text-lg font-semibold text-slate-100">
                  {passed ? "Aprovado" : "Ainda nao foi"}
                </div>
                <div className="text-sm text-slate-400">
                  {passed
                    ? "Passo concluido automaticamente."
                    : `Precisa acertar pelo menos ${Math.ceil(total * PASS_THRESHOLD)} pra concluir.`}
                </div>
              </div>
              <button
                onClick={() => {
                  setExtraCardsInfo(null);
                  load();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm"
              >
                Tentar de novo
              </button>
            </div>

            {extraCardsInfo && extraCardsInfo.inserted > 0 && (
              <div className="flex items-center gap-3 bg-cyan-950/30 border border-cyan-500/25 rounded-xl px-4 py-3 text-sm">
                <div className="text-cyan-300">🔁</div>
                <div className="text-cyan-100">
                  <strong>{extraCardsInfo.inserted}</strong> questao{extraCardsInfo.inserted > 1 ? "s" : ""} errada{extraCardsInfo.inserted > 1 ? "s" : ""} adicionada{extraCardsInfo.inserted > 1 ? "s" : ""} ao deck de flashcards dessa aula.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizViewer;
