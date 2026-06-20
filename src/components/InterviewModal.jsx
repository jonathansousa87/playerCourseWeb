import React, { useEffect, useState } from "react";
import { X, Loader2, Briefcase, ChevronRight, RotateCcw, AlertTriangle } from "lucide-react";
import { getInterviewQuestions, evaluateInterview } from "../utils/progressApi";

const MODELS = [
  { id: "deepseek-v4-flash", label: "deepseek-v4-flash (rapido)" },
  { id: "deepseek-v4-pro", label: "deepseek-v4-pro (raciocina mais)" },
];

// Cor da nota: vermelho < 5, ambar < 7, verde >= 7.
const scoreColor = (s) =>
  s >= 7 ? "text-emerald-300" : s >= 5 ? "text-amber-300" : "text-red-300";

const InterviewModal = ({ open, onClose, courseTitle, modulePath, moduleTitle }) => {
  const [phase, setPhase] = useState("loading"); // loading | answering | evaluating | result | error
  const [error, setError] = useState(null);
  const [model, setModel] = useState("deepseek-v4-flash");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState(null);

  const loadQuestions = async (refresh = false) => {
    setPhase("loading");
    setError(null);
    setResult(null);
    setIdx(0);
    try {
      const out = await getInterviewQuestions({ courseTitle, modulePath, moduleTitle, model, refresh });
      setQuestions(out.questions || []);
      setAnswers((out.questions || []).map(() => ""));
      setPhase("answering");
    } catch (err) {
      setError(err.message);
      setPhase("error");
    }
  };

  useEffect(() => {
    if (open) loadQuestions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const setAnswer = (val) =>
    setAnswers((prev) => prev.map((a, i) => (i === idx ? val : a)));

  const handleNext = () => {
    if (idx < questions.length - 1) setIdx(idx + 1);
  };

  const handleFinish = async () => {
    setPhase("evaluating");
    setError(null);
    try {
      const out = await evaluateInterview({
        courseTitle, modulePath, moduleTitle,
        questions,
        answers: answers.map((answer) => ({ answer })),
        model,
      });
      setResult(out);
      setPhase("result");
    } catch (err) {
      setError(err.message);
      setPhase("error");
    }
  };

  const q = questions[idx];
  const isLast = idx === questions.length - 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl">
        {/* Cabecalho */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-300">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-slate-100 font-semibold text-lg">Entrevista tecnica</h3>
              <p className="text-slate-400 text-sm mt-0.5 truncate max-w-md">{moduleTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 leading-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
              <p>O recrutador esta preparando as perguntas...</p>
            </div>
          )}

          {phase === "error" && (
            <div className="py-10 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="text-red-300 mb-4">{error}</p>
              <button
                onClick={() => loadQuestions(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {phase === "answering" && q && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  Pergunta {idx + 1} de {questions.length}
                </span>
                {q.topic && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {q.topic}
                  </span>
                )}
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-5">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
                />
              </div>
              <p className="text-slate-100 text-[17px] leading-relaxed mb-4">{q.question}</p>
              <textarea
                value={answers[idx]}
                onChange={(e) => setAnswer(e.target.value)}
                rows={7}
                autoFocus
                placeholder="Responda como numa entrevista de verdade — com suas palavras."
                className="w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 resize-y focus:outline-none focus:border-indigo-500/50"
              />
            </div>
          )}

          {phase === "evaluating" && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
              <p>Avaliando suas respostas...</p>
            </div>
          )}

          {phase === "result" && result && (
            <div className="space-y-5">
              <div className="text-center bg-gradient-to-r from-indigo-600/15 to-blue-600/15 border border-indigo-500/20 rounded-2xl py-6">
                <div className={`text-5xl font-bold ${scoreColor(result.score)}`}>
                  {result.score}
                  <span className="text-2xl text-slate-500">/{result.total}</span>
                </div>
                <p className="text-slate-300 text-sm mt-3 px-6">{result.feedback.overall_comment}</p>
              </div>

              <div className="space-y-3">
                {questions.map((qq, i) => {
                  const fb = result.feedback.per_question[i] || {};
                  return (
                    <div key={i} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-slate-200 text-sm font-medium flex-1">
                          {i + 1}. {qq.question}
                        </p>
                        <span className={`text-sm font-bold ${scoreColor(fb.score)}`}>{fb.score}/10</span>
                      </div>
                      <p className="text-[13px] text-slate-500 italic mb-2 whitespace-pre-wrap">
                        Sua resposta: {answers[i]?.trim() ? answers[i] : "(em branco)"}
                      </p>
                      <p className="text-[13px] text-indigo-200 bg-indigo-500/5 border-l-2 border-indigo-500/40 pl-3 py-1">
                        {fb.comment}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rodape */}
        <div className="p-6 pt-4 border-t border-slate-700/50 flex items-center justify-between gap-3">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={phase !== "answering" && phase !== "error"}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            {phase === "answering" && (
              isLast ? (
                <button
                  onClick={handleFinish}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium"
                >
                  Finalizar entrevista
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium flex items-center gap-1"
                >
                  Proxima <ChevronRight className="w-4 h-4" />
                </button>
              )
            )}
            {phase === "result" && (
              <button
                onClick={() => loadQuestions(true)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> Refazer (novas perguntas)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewModal;
