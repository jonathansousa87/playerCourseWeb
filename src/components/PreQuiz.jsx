// Pre-questoes (Carpenter & Toftness 2017): perguntas geradas por IA pra
// o aluno tentar responder ANTES de assistir o video. Errar nao pesa —
// o ato de tentar lembrar prepara a codificacao.

import React, { useEffect, useState } from "react";
import { CheckCircle, Circle, Sparkles, RefreshCw, Lightbulb } from "lucide-react";
import {
  fetchPrequestions,
  generatePrequestions,
  savePrequestionAttempt,
  deletePrequestions,
} from "../utils/progressApi";

const PreQuiz = ({ courseTitle, lessonPrefix, isCompleted, onMarkComplete }) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [lastAttempt, setLastAttempt] = useState(null);
  // selected[idx] = indice da alternativa escolhida (ou null)
  const [selected, setSelected] = useState({});
  // submitted: true depois que o aluno clicou "Ver respostas"
  const [submitted, setSubmitted] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPrequestions(courseTitle, lessonPrefix);
      setQuestions(data.questions);
      setLastAttempt(data.lastAttempt);
      setSelected({});
      setSubmitted(false);
    } catch (err) {
      setError(err.message || "erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseTitle, lessonPrefix]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await generatePrequestions({ courseTitle, lessonPrefix });
      setQuestions(data.questions);
      setLastAttempt(null);
      setSelected({});
      setSubmitted(false);
    } catch (err) {
      setError(err.message || "erro ao gerar");
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm("Apagar perguntas atuais e gerar novas? Tentativas anteriores tambem serao apagadas.")) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await deletePrequestions(courseTitle, lessonPrefix);
      const data = await generatePrequestions({ courseTitle, lessonPrefix });
      setQuestions(data.questions);
      setLastAttempt(null);
      setSelected({});
      setSubmitted(false);
    } catch (err) {
      setError(err.message || "erro ao regenerar");
    } finally {
      setGenerating(false);
    }
  };

  const handleSelect = (qIdx, optIdx) => {
    if (submitted) return;
    setSelected((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleSubmit = async () => {
    if (!questions) return;
    const allAnswered = questions.every((_, i) => selected[i] !== undefined);
    if (!allAnswered) {
      setError("Responda todas antes de continuar (tudo bem chutar — o objetivo eh tentar).");
      return;
    }
    setError(null);
    const answers = questions.map((q, i) => ({
      question_idx: i,
      selected_idx: selected[i],
      is_correct: selected[i] === q.correct_idx,
    }));
    try {
      const saved = await savePrequestionAttempt(courseTitle, lessonPrefix, answers);
      setLastAttempt(saved);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "erro ao salvar tentativa");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Carregando pre-quiz...
      </div>
    );
  }

  // Estado: ainda nao gerou
  if (!questions) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-slate-800/80 py-2 px-4 border-b border-slate-700/40 flex items-center justify-between">
          <h3 className="text-slate-200 font-medium text-sm flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" /> Pre-Quiz
          </h3>
        </div>
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          <div className="max-w-md w-full bg-slate-800/50 border border-slate-700/40 rounded-2xl p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/15 text-yellow-300 mb-3">
              <Lightbulb className="w-6 h-6" />
            </div>
            <h3 className="text-slate-100 font-semibold mb-2">Pre-Quiz: tente antes de assistir</h3>
            <p className="text-slate-400 text-sm mb-4 leading-relaxed">
              Responda 3 perguntas sobre a aula <strong className="text-slate-200">antes</strong> de
              assistir. Acertar nao importa — o ato de tentar lembrar prepara seu cerebro pra fixar
              melhor o conteudo (Carpenter & Toftness 2017, +10-25% retencao).
            </p>
            {error && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3 text-left">
                {error}
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border border-yellow-500/40 text-sm font-medium transition-all disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Gerando perguntas..." : "Gerar perguntas com IA"}
            </button>
            <p className="text-[11px] text-slate-500 mt-3">
              ~10-15s. Usa a transcricao da aula.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Estado: tem perguntas (e talvez tentativa salva).
  // showResults = mostra alternativas marcadas + explicacoes (apos clicar "Ver respostas")
  // hasPriorAttempt = banner informativo "ja respondeu antes"
  const showResults = submitted;
  const hasPriorAttempt = !!lastAttempt && !submitted;

  return (
    <div className="flex flex-col h-full">
      <div className="bg-slate-800/80 py-2 px-4 border-b border-slate-700/40 flex items-center justify-between">
        <h3 className="text-slate-200 font-medium text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-400" /> Pre-Quiz
          {lastAttempt && (
            <span className="text-xs text-slate-400 font-normal">
              · ultima: {lastAttempt.score}/{lastAttempt.total}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRegenerate}
            disabled={generating}
            title="Regenerar perguntas (apaga tentativas)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border border-slate-600/30 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} />
            Regenerar
          </button>
          <button
            onClick={() => onMarkComplete("prequiz")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isCompleted
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                : "bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border border-slate-600/30"
            }`}
          >
            {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            {isCompleted ? "Concluido" : "Concluir"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 lg:px-12 xl:px-20 py-6">
        <div className="w-full space-y-4">
          {hasPriorAttempt && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-blue-200 text-sm">
              Voce ja respondeu antes ({lastAttempt.score}/{lastAttempt.total}). Tente de novo
              ou regenere para um conjunto de perguntas novo.
            </div>
          )}

          {questions.map((q, qIdx) => {
            const userPick = selected[qIdx];
            return (
              <div
                key={qIdx}
                className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-5"
              >
                <div className="flex items-start gap-3 mb-3">
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/15 text-yellow-300 text-xs font-bold border border-yellow-500/30">
                    {qIdx + 1}
                  </span>
                  <h4 className="text-slate-100 font-medium leading-relaxed">{q.question}</h4>
                </div>
                <div className="space-y-2 ml-10">
                  {q.options.map((opt, optIdx) => {
                    const isPicked = userPick === optIdx;
                    const isCorrect = optIdx === q.correct_idx;
                    let stateClass =
                      "bg-slate-900/60 border-slate-700/50 text-slate-200 hover:border-yellow-500/40 hover:bg-yellow-500/5";
                    if (showResults) {
                      if (isCorrect) {
                        stateClass = "bg-emerald-500/15 border-emerald-500/40 text-emerald-100";
                      } else if (isPicked) {
                        stateClass = "bg-red-500/15 border-red-500/40 text-red-100";
                      } else {
                        stateClass = "bg-slate-900/40 border-slate-700/30 text-slate-400 opacity-70";
                      }
                    } else if (isPicked) {
                      stateClass = "bg-yellow-500/15 border-yellow-500/50 text-yellow-100";
                    }

                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleSelect(qIdx, optIdx)}
                        disabled={submitted}
                        className={`w-full text-left px-4 py-2.5 rounded-xl border-2 text-sm transition-all ${stateClass} disabled:cursor-default`}
                      >
                        <span className="font-mono text-xs opacity-70 mr-2">
                          {String.fromCharCode(65 + optIdx)}.
                        </span>
                        {opt}
                        {showResults && isCorrect && (
                          <CheckCircle className="inline w-4 h-4 ml-2 text-emerald-300" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {showResults && q.explanation && (
                  <div className="mt-3 ml-10 px-3 py-2 bg-slate-900/60 border-l-2 border-yellow-500/50 rounded-r-lg text-sm text-slate-300 italic">
                    <strong className="text-yellow-300 not-italic">Por que:</strong>{" "}
                    {q.explanation}
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {!submitted && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border border-yellow-500/40 font-medium transition-all"
              >
                Ver respostas
              </button>
            </div>
          )}

          {submitted && lastAttempt && (
            <div className="bg-slate-800/80 border border-slate-700/40 rounded-2xl p-5 text-center">
              <div className="text-2xl font-bold text-slate-100 mb-1">
                {lastAttempt.score} / {lastAttempt.total}
              </div>
              <p className="text-sm text-slate-400">
                {lastAttempt.score === lastAttempt.total
                  ? "Acertou tudo. Mesmo assim assista — vai consolidar."
                  : "O ato de tentar ja preparou a codificacao. Agora assista."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreQuiz;
