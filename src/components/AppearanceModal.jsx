import React from "react";
import { useTheme } from "../contexts/ThemeContext";

// Extraido do ConfigModal: e a UNICA config que faz sentido pra qualquer
// usuario aprovado mexer (o resto do ConfigModal e credencial compartilhada
// da plataforma, ai sim so admin).
const AppearanceModal = ({ onClose }) => {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="rounded-2xl p-6 w-full max-w-md border max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-strong)",
        }}
      >
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text)" }}>
          Aparência
        </h2>

        <div className="mb-5">
          <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
            Tema visual
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--text-subtle)" }}>
            Cores baseadas em neurociência para reduzir fadiga ocular em sessões longas.
            O tema é aplicado e salvo automaticamente ao clicar — não precisa do botão Salvar.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {themes.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className="flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:bg-[var(--surface-hover)]"
                  style={{
                    background: active ? "var(--accent-soft)" : "var(--bg-soft)",
                    borderColor: active ? "var(--accent)" : "var(--border)",
                  }}
                >
                  <div className="flex gap-1 flex-shrink-0">
                    {t.swatches.map((c, i) => (
                      <span
                        key={i}
                        className="w-5 h-5 rounded-full border"
                        style={{ background: c, borderColor: "var(--border)" }}
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {t.label}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-subtle)" }}>
                      {t.description}
                    </div>
                  </div>
                  {active && (
                    <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                      ativo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl text-sm text-slate-300 transition-all"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};

export default AppearanceModal;
