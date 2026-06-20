import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// Tema escuro pra casar com a plataforma. securityLevel 'loose' permite os
// labels com acento/HTML que a IA costuma gerar.
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "inherit",
});

let idSeq = 0;

// Renderiza um diagrama Mermaid. Se o codigo for invalido (a IA pode escorregar
// na sintaxe), cai num fallback mostrando o codigo cru em vez de quebrar a pagina.
const MermaidDiagram = ({ chart }) => {
  const ref = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++idSeq}`;
    setError(false);
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <pre className="my-5 p-4 bg-slate-900/80 border border-amber-500/30 rounded-xl overflow-x-auto text-[13px] font-mono text-slate-400">
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="my-6 flex justify-center bg-slate-900/40 border border-slate-700/40 rounded-xl p-4 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
    />
  );
};

export default MermaidDiagram;
