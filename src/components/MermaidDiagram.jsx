import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// Tema escuro pra casar com a plataforma. securityLevel 'loose' permite os
// labels com acento/HTML que a IA costuma gerar.
//
// fontFamily CONCRETA (nao "inherit"): com "inherit" o Mermaid media a caixa com
// uma fonte diferente da renderizada e o texto saia CORTADO.
// htmlLabels:true + wrappingWidth: rotulos longos QUEBRAM em varias linhas (em
// foreignObject) e a caixa cresce em ALTURA, em vez de cortar o texto.
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  // useMaxWidth:false -> NAO escala o diagrama pra caber na largura (era isso que
  // deixava flowcharts largos minusculos). Fica no tamanho natural e o container
  // rola na horizontal quando precisa. Vale pros tipos largos (sequence etc.) tb.
  flowchart: { htmlLabels: true, useMaxWidth: false, wrappingWidth: 170, padding: 12, nodeSpacing: 50, rankSpacing: 62 },
  sequence: { useMaxWidth: false },
  class: { useMaxWidth: false },
  er: { useMaxWidth: false },
  state: { useMaxWidth: false },
  themeVariables: { fontSize: "15px" },
  // Garante que o texto do no quebre linha (e nao corte) dentro do foreignObject.
  themeCSS: `
    .nodeLabel, .node .label, .node foreignObject div, .node foreignObject span, .node foreignObject p {
      white-space: normal !important;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
    }
  `,
});

let idSeq = 0;

// Luminancia relativa de uma cor "rgb(r,g,b)" (0 = escuro, 1 = claro).
const luminanceOf = (rgb) => {
  const m = /rgba?\(([^)]+)\)/.exec(rgb || "");
  if (!m) return 0; // sem cor detectada -> trata como escuro (texto claro)
  const [r, g, b] = m[1].split(",").map((v) => parseFloat(v) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Ajusta a cor do TEXTO de cada no conforme a cor da caixa: caixa clara -> texto
// escuro; caixa escura -> texto claro. Respeita as cores que a IA definiu (so
// corrige o contraste, que era o problema). Funciona ate em diagramas ja gerados.
const fixContrast = (root) => {
  const svg = root.querySelector("svg");
  if (!svg) return;
  svg.querySelectorAll("g.node").forEach((node) => {
    const shape = node.querySelector("rect, polygon, circle, ellipse, path");
    if (!shape) return;
    const fill = getComputedStyle(shape).fill;
    const color = luminanceOf(fill) < 0.5 ? "#e8eef6" : "#0f172a";
    node.querySelectorAll("text, tspan, .nodeLabel, .label, span, div, p").forEach((t) => {
      t.style.setProperty("fill", color, "important");
      t.style.setProperty("color", color, "important");
    });
  });
};

// Renderiza um diagrama Mermaid. Se o codigo for invalido (a IA pode escorregar
// na sintaxe), cai num fallback mostrando o codigo cru em vez de quebrar a pagina.
const MermaidDiagram = ({ chart }) => {
  const ref = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const run = async () => {
      try {
        // Valida ANTES de renderizar. mermaid.parse com suppressErrors retorna
        // false (sem lancar e SEM injetar o "Syntax error in text" no DOM) se o
        // codigo for invalido — ai caimos no fallback limpo (mostra o codigo).
        const ok = await mermaid.parse(chart, { suppressErrors: true });
        if (ok === false) throw new Error("mermaid: sintaxe invalida");
        const id = `mermaid-${++idSeq}`;
        const { svg } = await mermaid.render(id, chart);
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        fixContrast(ref.current);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    run();
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
      className="my-6 bg-slate-900/40 border border-slate-700/40 rounded-xl p-4 overflow-x-auto [&_svg]:h-auto [&_svg]:mx-auto [&_svg]:block"
    />
  );
};

export default MermaidDiagram;
