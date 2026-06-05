import React from "react";
import { Loader2, AlertTriangle } from "lucide-react";

// Estado de carregamento padrão dos viewers. Centraliza o layout antes
// espalhado (texto/spinner) em cada componente.
export const LoadingState = ({ message = "Carregando..." }) => (
  <div className="flex items-center justify-center h-full text-slate-400">
    <div className="flex items-center gap-2 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>{message}</span>
    </div>
  </div>
);

// Estado de erro padrão dos viewers, com botão de retry opcional.
export const ErrorState = ({ message = "Erro ao carregar conteúdo.", onRetry }) => (
  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 px-4 text-center">
    <AlertTriangle className="w-6 h-6 text-amber-400" />
    <div className="text-sm">{message}</div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 border border-slate-600/30 transition-colors"
      >
        Tentar novamente
      </button>
    )}
  </div>
);
