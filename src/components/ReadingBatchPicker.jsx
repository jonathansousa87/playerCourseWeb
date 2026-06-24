import React, { useState } from "react";
import { X, BookOpenText, Check } from "lucide-react";

// Seletor de cursos pra geracao de curso de leitura em LOTE. O usuario marca
// quais cursos entram na fila; cada um sera processado depois no modal padrao
// (com sua propria selecao de modulos/nicho). Cursos que ja sao "- Leitura"
// ficam de fora (nao se gera leitura de leitura).
const ReadingBatchPicker = ({ courses, onClose, onStart }) => {
  const eligible = (courses || []).filter((c) => !/ - Leitura$/i.test(c.title));
  const [selected, setSelected] = useState(() => new Set());

  const toggle = (title) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });

  const start = () => {
    const queue = eligible.filter((c) => selected.has(c.title));
    if (queue.length) onStart(queue);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-300">
              <BookOpenText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-slate-100 font-semibold text-lg">Gerar curso de leitura</h3>
              <p className="text-slate-400 text-sm mt-0.5">
                Escolha os cursos. Eles entram numa fila e voce configura os modulos e o nicho de cada um.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 leading-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {eligible.length === 0 ? (
            <div className="py-12 text-center text-slate-400">Nenhum curso disponivel.</div>
          ) : (
            eligible.map((c) => {
              const on = selected.has(c.title);
              return (
                <button
                  key={c.title}
                  onClick={() => toggle(c.title)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-left ${
                    on
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-slate-700/50 bg-slate-800/40 text-slate-300 hover:bg-slate-800/80"
                  }`}
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    on ? "bg-emerald-500 border-emerald-500" : "border-slate-600"
                  }`}>
                    {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0 truncate" title={c.title}>{c.title}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-6 pt-4 border-t border-slate-700/50 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{selected.size} curso(s) na fila</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
              Cancelar
            </button>
            <button
              onClick={start}
              disabled={selected.size === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Iniciar fila ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadingBatchPicker;
