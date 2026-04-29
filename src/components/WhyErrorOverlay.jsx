// Overlay que aparece quando o aluno erra um flashcard (rating=1, "Errei").
// Em vez de avancar direto, oferece "Por que errei?" — clica e a IA explica
// o conceito + da um truque mnemonico, usando a transcricao da aula como
// contexto (Mullet & Butler 2022: feedback elaborado eh 1.5-2x mais eficaz
// que feedback binario).
//
// O turno fica salvo em lesson_chats (igual chat normal), entao o aluno
// pode revisar depois pelo ChatFAB.

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { sendChatMessage } from "../utils/progressApi";

const buildMessage = (front, back) =>
  `Errei esse flashcard:

**Pergunta:** ${front}

**Resposta correta:** ${back}

Explica em 2-3 paragrafos: o que esse conceito significa de fato, por que ele importa, e me da um truque (analogia, mnemonico ou comparacao) que ajude a fixar pra eu nao errar de novo.`;

const WhyErrorOverlay = ({ courseTitle, lessonPrefix, card, onContinue }) => {
  // states: 'idle' (mostra back + botao perguntar), 'loading', 'done' (mostra explicacao), 'error'
  const [state, setState] = useState("idle");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");

  const askIa = async () => {
    setState("loading");
    setError("");
    try {
      const res = await sendChatMessage({
        courseTitle,
        lessonPrefix,
        message: buildMessage(card.front, card.back),
      });
      setExplanation(res.reply);
      setState("done");
    } catch (err) {
      setError(err.message || "Falha ao consultar IA");
      setState("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={(e) => {
        // Click fora avanca direto (mesmo comportamento do "Pular")
        if (e.target === e.currentTarget) onContinue();
      }}
    >
      <div className="bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/40">
          <h3 className="text-red-300 font-semibold text-sm flex items-center gap-2">
            <span className="inline-flex w-2 h-2 rounded-full bg-red-400" />
            Errou esse card
          </h3>
          <button
            onClick={onContinue}
            className="text-slate-500 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
            title="Pular e ir pro proximo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1">
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Pergunta</div>
            <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap">
              {card.front}
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">Resposta correta</div>
            <div className="text-emerald-50 text-sm leading-relaxed whitespace-pre-wrap">
              {card.back}
            </div>
          </div>

          {state === "done" && explanation && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
              <div className="text-[10px] text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> IA explica
              </div>
              <div className="text-blue-50 text-sm leading-relaxed prose-embedded">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="bg-red-950/40 border border-red-500/30 text-red-200 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {state === "loading" && (
            <div className="flex items-center gap-2 px-4 py-3 text-slate-400 text-sm">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: "0.3s" }} />
              <span className="ml-1">IA pensando...</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-700/40 flex items-center justify-between gap-2">
          {state === "idle" && (
            <>
              <button
                onClick={onContinue}
                className="text-slate-400 hover:text-slate-200 text-sm transition"
              >
                Pular
              </button>
              <button
                onClick={askIa}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition"
              >
                <Sparkles className="w-4 h-4" />
                Por que errei?
              </button>
            </>
          )}

          {state === "loading" && (
            <>
              <span className="text-xs text-slate-500">~5-15s</span>
              <button
                disabled
                className="px-4 py-2 bg-blue-600/40 text-white/60 rounded-xl text-sm font-medium cursor-not-allowed"
              >
                Pensando...
              </button>
            </>
          )}

          {(state === "done" || state === "error") && (
            <>
              {state === "error" && (
                <button
                  onClick={askIa}
                  className="text-blue-300 hover:text-blue-200 text-sm transition"
                >
                  Tentar de novo
                </button>
              )}
              <div className="ml-auto" />
              <button
                onClick={onContinue}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition"
              >
                Proximo card
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhyErrorOverlay;
