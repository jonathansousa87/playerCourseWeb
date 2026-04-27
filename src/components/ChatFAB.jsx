import React, { useState, useEffect } from "react";
import { MessageCircle, X } from "lucide-react";
import LessonChat from "./LessonChat";

// Botao flutuante (FAB) que abre o LessonChat em um painel deslizante.
// Posicionado no canto inferior direito; nao colide com o Pomodoro (centro
// inferior). Fecha com Esc, com o botao X ou clicando no backdrop.
const ChatFAB = ({ courseTitle, lessonPrefix, lessonTitle }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Reseta ao trocar de aula (fecha painel se estiver aberto)
  useEffect(() => {
    setOpen(false);
  }, [lessonPrefix]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Fechar chat" : "Tirar dúvida com IA"}
        className={`fixed bottom-6 right-6 z-[60] flex items-center justify-center w-14 h-14 rounded-full shadow-lg backdrop-blur-md border transition-all duration-200 ${
          open
            ? "bg-slate-800/90 border-slate-600/60 text-slate-200 hover:bg-slate-700/90"
            : "bg-blue-600/40 hover:bg-blue-500/60 border-blue-400/40 text-blue-50 hover:scale-105"
        }`}
        aria-label="Chat IA"
      >
        {open ? (
          <X className="w-5 h-5" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed bottom-24 right-6 z-[60] w-full max-w-md sm:max-w-lg lg:max-w-xl bg-slate-950 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ height: "min(75vh, 700px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 bg-slate-900/60">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-blue-400" />
                <h3 className="text-slate-100 font-semibold text-sm">
                  Chat IA — {lessonTitle}
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
                title="Fechar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <LessonChat
                courseTitle={courseTitle}
                lessonPrefix={lessonPrefix}
                lessonTitle={lessonTitle}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default ChatFAB;
