import React from "react";
import { CheckCircle, Circle } from "lucide-react";

const LessonHeader = ({
  title,
  onBack,
  showComplete = false,
  isCompleted = false,
  onToggleComplete,
  children,
}) => (
  <div className="bg-slate-800/80 py-1.5 px-4 border-b border-slate-700/40">
    <div className="flex justify-between items-center">
      <div className="flex items-center min-w-0">
        <h2 className="text-sm font-semibold text-slate-200 truncate">{title}</h2>
      </div>
      <div className="flex items-center space-x-2 flex-shrink-0">
        {showComplete && onToggleComplete && (
          <button
            onClick={onToggleComplete}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all mr-2 ${
              isCompleted
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                : "bg-slate-700/60 hover:bg-emerald-600/80 text-slate-300 hover:text-white border border-slate-600/30"
            }`}
          >
            {isCompleted ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <Circle className="w-3.5 h-3.5" />
            )}
            {isCompleted ? "Concluido" : "Concluir"}
          </button>
        )}
        {children}
        <button
          onClick={onBack}
          className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-600/60 rounded-lg text-xs text-slate-300 transition-colors border border-slate-600/30"
        >
          Voltar
        </button>
      </div>
    </div>
  </div>
);

export default LessonHeader;
