import React, { useEffect, useRef, useState } from "react";
import { StickyNote, Minus, Loader2, Check } from "lucide-react";
import { getScratchpad, saveScratchpad } from "../utils/progressApi";

// Bloco de notas GLOBAL (o mesmo em todas as aulas). Flutua sobre a pipeline,
// pode minimizar/abrir e salva no banco com debounce (sincroniza entre maquinas).
const FloatingNotes = () => {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const saveTimer = useRef(null);
  const dirty = useRef(false);

  // Carrega uma vez, na primeira abertura (evita request se nunca abrir).
  useEffect(() => {
    if (!open || loaded) return;
    getScratchpad()
      .then((d) => setContent(d.content || ""))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  const scheduleSave = (text) => {
    dirty.current = true;
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveScratchpad(text);
        dirty.current = false;
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setStatus("idle");
      }
    }, 700);
  };

  // Salva pendente ao fechar a aba/janela.
  useEffect(() => {
    const flush = () => {
      if (dirty.current) saveScratchpad(content).catch(() => {});
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [content]);

  const onChange = (e) => {
    setContent(e.target.value);
    scheduleSave(e.target.value);
  };

  // Botao flutuante (quando fechado/minimizado) — canto inferior ESQUERDO, pra
  // nao colidir com o FAB do chat com IA (canto inferior direito).
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Bloco de notas"
        className="fixed bottom-6 left-6 z-[70] flex items-center gap-2 px-3.5 py-2.5 rounded-full shadow-lg border text-sm font-medium transition-all hover:brightness-110"
        style={{ background: "var(--accent-soft)", borderColor: "var(--accent-soft-strong)", color: "var(--accent)" }}
      >
        <StickyNote className="w-4 h-4" />
        Notas
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 left-6 z-[70] w-[30rem] max-w-[calc(100vw-3rem)] h-[68vh] max-h-[44rem] rounded-2xl shadow-2xl border flex flex-col"
      style={{ background: "var(--surface)", borderColor: "var(--border-strong)" }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b rounded-t-2xl"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="flex items-center gap-2" style={{ color: "var(--text)" }}>
          <StickyNote className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold">Bloco de notas</span>
          {status === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--text-subtle)" }} />}
          {status === "saved" && <Check className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen(false)}
            title="Minimizar"
            className="p-1 rounded hover:bg-[var(--surface-hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>
      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-subtle)" }} />
        </div>
      ) : (
        <textarea
          value={content}
          onChange={onChange}
          placeholder="Anote o que quiser — salva sozinho e sincroniza entre suas maquinas."
          className="flex-1 w-full resize-none bg-transparent px-3.5 py-3 text-sm leading-relaxed focus:outline-none rounded-b-2xl"
          style={{ color: "var(--text)" }}
        />
      )}
    </div>
  );
};

export default FloatingNotes;
