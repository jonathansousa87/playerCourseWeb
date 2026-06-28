import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mermaid from "mermaid";
import { Maximize2, X, ZoomIn, ZoomOut, RotateCcw, RefreshCw } from "lucide-react";
import FlowDiagram from "./FlowDiagram";

// Tema "base" + themeVariables espelhando a paleta do FlowDiagram (React Flow):
// fundo slate escuro, borda de acento sky, texto claro e linhas slate-400. Assim
// o fallback Mermaid fica visualmente no mesmo padrao da biblioteca principal,
// em vez do lilas padrao do theme "dark". securityLevel 'loose' permite os
// labels com acento/HTML que a IA costuma gerar.
//
// fontFamily CONCRETA (nao "inherit"): com "inherit" o Mermaid media a caixa com
// uma fonte diferente da renderizada e o texto saia CORTADO.
// htmlLabels:true + wrappingWidth: rotulos longos QUEBRAM em varias linhas (em
// foreignObject) e a caixa cresce em ALTURA, em vez de cortar o texto.
mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "loose",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  // useMaxWidth:false -> NAO escala o diagrama pra caber na largura (era isso que
  // deixava flowcharts largos minusculos). Fica no tamanho natural e o container
  // rola na horizontal quando precisa. Vale pros tipos largos (sequence etc.) tb.
  // curve "linear" -> arestas retas (sem as curvas onduladas do "basis" padrao),
  // proximas do visual do FlowDiagram. NAO usar "step": no Mermaid a seta orienta
  // pela tangente do ultimo segmento, e o segmento final do step costuma chegar
  // na horizontal -> a ponta aponta "de lado" pra dentro do no (lugar errado).
  // No "linear" a tangente final aponta pra dentro do no, entao a seta acerta.
  flowchart: { htmlLabels: true, useMaxWidth: false, wrappingWidth: 170, padding: 12, nodeSpacing: 50, rankSpacing: 62, curve: "linear" },
  sequence: { useMaxWidth: false },
  class: { useMaxWidth: false },
  er: { useMaxWidth: false },
  state: { useMaxWidth: false },
  themeVariables: {
    darkMode: true,
    fontSize: "15px",
    background: "transparent",
    // --- nos (caixas) ---
    primaryColor: "#1e293b",
    mainBkg: "#1e293b",
    primaryBorderColor: "#38bdf8",
    nodeBorder: "#38bdf8",
    primaryTextColor: "#e8eef6",
    nodeTextColor: "#e8eef6",
    secondaryColor: "#0e2a3f",
    secondaryBorderColor: "#38bdf8",
    secondaryTextColor: "#e0f2fe",
    tertiaryColor: "#0f2a22",
    tertiaryBorderColor: "#34d399",
    tertiaryTextColor: "#d1fae5",
    // --- linhas / labels / texto ---
    lineColor: "#94a3b8",
    defaultLinkColor: "#94a3b8",
    textColor: "#cbd5e1",
    titleColor: "#e8eef6",
    edgeLabelBackground: "#0f172a",
    // --- subgraphs / clusters ---
    clusterBkg: "#0f172a",
    clusterBorder: "#334155",
    // --- sequence diagram ---
    actorBkg: "#1e293b",
    actorBorder: "#38bdf8",
    actorTextColor: "#e8eef6",
    actorLineColor: "#475569",
    signalColor: "#94a3b8",
    signalTextColor: "#cbd5e1",
    labelBoxBkgColor: "#0e2a3f",
    labelBoxBorderColor: "#38bdf8",
    labelTextColor: "#e0f2fe",
    loopTextColor: "#cbd5e1",
    activationBkgColor: "#0e2a3f",
    activationBorderColor: "#38bdf8",
    sequenceNumberColor: "#0f172a",
    noteBkgColor: "#3a2a0e",
    noteBorderColor: "#fbbf24",
    noteTextColor: "#fef3c7",
    // --- class / state / ER ---
    classText: "#e8eef6",
    labelColor: "#e8eef6",
    attributeBackgroundColorOdd: "#1e293b",
    attributeBackgroundColorEven: "#172033",
  },
  // Garante que o texto do no quebre linha (e nao corte) dentro do foreignObject.
  themeCSS: `
    .nodeLabel, .node .label, .node foreignObject div, .node foreignObject span, .node foreignObject p {
      white-space: normal !important;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
    }
    /* Arestas no padrao do FlowDiagram: traco slate-400 1.5px, cantos das
       quebras ortogonais arredondados (stroke-linejoin: round). */
    .flowchart-link, .edgePath .path, .edge-thickness-normal {
      stroke: #94a3b8 !important;
      stroke-width: 1.5px !important;
      stroke-linejoin: round !important;
      stroke-linecap: round !important;
    }
    /* Pontas de seta preenchidas em slate-400 (em vez da cor padrao). */
    marker path, .arrowheadPath, .marker {
      fill: #94a3b8 !important;
      stroke: #94a3b8 !important;
    }
    /* MINDMAP: o Mermaid colore por "section" (git0..7) — sobrepoe pra ficar no
       padrao do mindmap do FlowDiagram. Raiz verde; demais nos slate c/ borda
       sky; texto claro; conexoes slate-500 1.5px. So afeta classes de mindmap. */
    .mindmap-node rect, .mindmap-node circle, .mindmap-node polygon, .mindmap-node path,
    .mindmap-node .node-bkg {
      fill: #1e293b !important;
      stroke: #38bdf8 !important;
      stroke-width: 1.5px !important;
    }
    .mindmap-node .node-line { stroke: #38bdf8 !important; }
    .section-root rect, .section-root circle, .section-root path, .section-root polygon {
      fill: #064e3b !important;
      stroke: #34d399 !important;
    }
    .mindmap-node text, .mindmap-node span, .mindmap-node .mindmap-node-label,
    .mindmap-node .text-inner-tspan, .mindmap-node .text-outer-tspan,
    .section-root text, .section-root span {
      fill: #e8eef6 !important;
      color: #e8eef6 !important;
    }
    .edge { stroke: #64748b !important; stroke-width: 1.5px !important; }
  `,
});

let idSeq = 0;

// Rede de seguranca pra deslizes da IA em FLOWCHART: cita o texto de TODO no que
// ainda nao esta entre aspas. Sem aspas, varios caracteres quebram o parser do
// Mermaid (':' e principalmente '@', reservado pra nova sintaxe de shapes), e o
// diagrama cai no fallback de codigo cru. So roda em flowchart/graph — em
// classDiagram/sequence o ':' E sintaxe e nao pode ser tocado.
//
// CRITICO: antes de aplicar os wraps, MASCARA o que ja esta entre aspas, pra os
// regex NAO enxergarem os () [] {} DENTRO de um label ja citado. Sem isso, um
// label valido como ["Repository (Spring Data JPA)"] ou ["findAll(Specification)"]
// tinha o miolo "(...)" re-citado -> aspas aninhadas -> Mermaid quebra -> codigo
// cru. O guard "inner ja tem aspas" continua evitando re-citar shapes duplos
// ([(...)] etc.) que esta funcao acabou de citar na mesma passada.
const PUA = ""; // sentinela (uso privado) — nao aparece em transcricao/diagrama
const quoteRiskyLabels = (code) => {
  if (!/^\s*(flowchart|graph)\b/.test(code)) return code;
  const masks = [];
  let masked = code.replace(/"[^"]*"/g, (m) => `${PUA}${masks.push(m) - 1}${PUA}`);
  const isMasked = (t) => new RegExp(`${PUA}\\d+${PUA}`).test(t);
  const wrap = (open, close) => (m, inner) => {
    const t = inner.trim();
    return !t || t.includes('"') || isMasked(t) ? m : `${open}"${t}"${close}`;
  };
  masked = masked
    .replace(/\[\(([^\]]*?)\)\]/g, wrap("[(", ")]"))
    .replace(/\(\[([^)]*?)\]\)/g, wrap("([", "])"))
    .replace(/\(\(([^)]*?)\)\)/g, wrap("((", "))"))
    .replace(/\{\{([^}]*?)\}\}/g, wrap("{{", "}}"))
    .replace(/\[([^\]]*?)\]/g, wrap("[", "]"))
    .replace(/\{([^}]*?)\}/g, wrap("{", "}"))
    .replace(/\(([^)]*?)\)/g, wrap("(", ")"));
  return masked.replace(new RegExp(`${PUA}(\\d+)${PUA}`, "g"), (_, i) => masks[Number(i)]);
};

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

// Fundo de pontos identico ao <Background> do React Flow (pontos #1e293b a cada
// 20px) sobre o slate-900/40 — pra o fallback Mermaid usar a MESMA moldura do
// FlowDiagram (canvas pontilhado + borda).
const DOT_BG = {
  backgroundColor: "rgba(15,23,42,0.4)",
  backgroundImage: "radial-gradient(circle, #1e293b 1px, transparent 1px)",
  backgroundSize: "20px 20px",
};

// Injeta o SVG ja renderizado, corrige o contraste do texto e aplica o zoom
// (escala a largura do SVG pelo tamanho natural -> o container rola normalmente).
// Reusado inline e em tela cheia (cada um com seu proprio container/scroll).
const SvgHost = ({ svg, className, style, zoom = 1 }) => {
  const ref = useRef(null);
  const natural = useRef(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const el = host.querySelector("svg");
    natural.current = null;
    if (!el) return;
    fixContrast(host);
    const w = parseFloat(el.getAttribute("width")) || el.getBoundingClientRect().width;
    const h = parseFloat(el.getAttribute("height")) || el.getBoundingClientRect().height;
    natural.current = { w, h };
    // viewBox garante que escalar a largura escale o desenho proporcionalmente.
    if (!el.getAttribute("viewBox") && w && h) el.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }, [svg]);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector("svg");
    if (el && natural.current) {
      el.style.width = `${natural.current.w * zoom}px`;
      el.style.height = "auto";
      el.style.maxWidth = "none";
    }
  }, [zoom, svg]);
  return <div ref={ref} className={className} style={style} dangerouslySetInnerHTML={{ __html: svg }} />;
};

// Botoes de zoom no estilo do <Controls> do React Flow (canto inferior esquerdo).
const ZoomControls = ({ onIn, onOut, onReset }) => (
  <div className="absolute bottom-2 left-2 z-10 flex flex-col rounded-md overflow-hidden border border-slate-600/40 bg-slate-800/80 backdrop-blur-sm">
    <button onClick={onIn} title="Aproximar" className="p-1.5 text-slate-300 hover:bg-slate-700">
      <ZoomIn className="w-4 h-4" />
    </button>
    <button onClick={onOut} title="Afastar" className="p-1.5 text-slate-300 hover:bg-slate-700 border-y border-slate-600/40">
      <ZoomOut className="w-4 h-4" />
    </button>
    <button onClick={onReset} title="Tamanho original" className="p-1.5 text-slate-300 hover:bg-slate-700">
      <RotateCcw className="w-4 h-4" />
    </button>
  </div>
);

// Container rolavel que permite ARRASTAR com o mouse (segurar e puxar pra
// qualquer direcao), igual ao pan do React Flow. Cursor vira mãozinha.
const PanScroll = ({ className, style, children }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false, sx = 0, sy = 0, sl = 0, st = 0;
    const onDown = (e) => {
      if (e.button !== 0) return; // so botao esquerdo
      down = true;
      sx = e.clientX; sy = e.clientY; sl = el.scrollLeft; st = el.scrollTop;
      el.style.cursor = "grabbing";
      e.preventDefault(); // evita selecionar o texto do SVG ao arrastar
    };
    const onMove = (e) => {
      if (!down) return;
      el.scrollLeft = sl - (e.clientX - sx);
      el.scrollTop = st - (e.clientY - sy);
    };
    const onUp = () => { if (down) { down = false; el.style.cursor = "grab"; } };
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  return (
    <div ref={ref} className={className} style={{ cursor: "grab", ...style }}>
      {children}
    </div>
  );
};

// Tira os delimitadores de forma do Mermaid mindmap (((circulo)), [retangulo],
// (arredondado), {{hexagono}}, ))bang((, )nuvem() e decoracoes (::icon/:::class),
// deixando so o texto do no.
const stripShape = (raw) => {
  const s = raw.replace(/::icon\([^)]*\)/g, "").replace(/:::[^\s]+/g, "").trim();
  // [\w-]* = id opcional antes da forma (sintaxe "id((texto))" do Mermaid).
  for (const re of [/^[\w-]*\(\((.*)\)\)$/, /^[\w-]*\)\)(.*)\(\($/, /^[\w-]*\)(.*)\($/, /^[\w-]*\{\{(.*)\}\}$/, /^[\w-]*\[(.*)\]$/, /^[\w-]*\((.*)\)$/]) {
    const m = re.exec(s);
    if (m) return m[1].trim();
  }
  return s;
};

// Converte a sintaxe de mindmap do Mermaid no spec JSON do FlowDiagram, pela
// indentacao. Assim o mapa mental usa EXATAMENTE o mesmo render do FlowDiagram
// (raiz arredondada verde, branch sky, leaf slate) em vez do mindmap nativo do
// Mermaid (raiz circular + cores por "section"). Retorna null se nao for mindmap.
const mindmapToSpec = (chart) => {
  if (!/^\s*mindmap\b/.test(chart || "")) return null;
  const lines = (chart || "")
    .split("\n")
    .filter((l) => l.trim() && !/^\s*mindmap\b/.test(l) && !/^\s*%%/.test(l));
  const nodes = [], edges = [], stack = [];
  lines.forEach((line, i) => {
    const indent = (line.match(/^[\t ]*/)[0]).replace(/\t/g, "  ").length;
    const label = stripShape(line.trim());
    if (!label) return;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const id = `n${i}`;
    const depth = stack.length;
    const parent = stack[stack.length - 1];
    nodes.push({ id, label, kind: depth === 0 ? "root" : depth === 1 ? "branch" : "leaf" });
    if (parent) edges.push({ source: parent.id, target: id });
    stack.push({ indent, id });
  });
  if (!nodes.length) return null;
  // Garante uma unica raiz: nos extras sem pai viram branch ligados a raiz.
  const rootId = nodes[0].id;
  const hasParent = new Set(edges.map((e) => e.target));
  nodes.slice(1).forEach((n) => {
    if (!hasParent.has(n.id)) {
      edges.push({ source: rootId, target: n.id });
      if (n.kind === "root") n.kind = "branch";
    }
  });
  return { type: "mindmap", direction: "TB", nodes, edges };
};

// Renderiza um diagrama Mermaid. Se o codigo for invalido (a IA pode escorregar
// na sintaxe), cai num fallback mostrando o codigo cru em vez de quebrar a pagina.
const MermaidNative = ({ chart, onRegenerate }) => {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");

  const zoomIn = () => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.3, +(z - 0.2).toFixed(2)));
  const zoomReset = () => setZoom(1);

  // Regenera SO este diagrama (chama o pai, que troca o bloco e re-renderiza).
  const handleRegen = async () => {
    if (!onRegenerate || regenerating) return;
    setRegenerating(true);
    setRegenError("");
    try {
      await onRegenerate(chart);
    } catch (e) {
      setRegenError(e.message || "falha ao regenerar");
      setRegenerating(false);
    }
    // Sucesso: o pai troca o conteudo -> este componente re-renderiza com o
    // novo chart, entao nao precisa limpar o "regenerating" aqui.
  };

  const RegenBtn = ({ className = "" }) =>
    onRegenerate ? (
      <button
        onClick={handleRegen}
        disabled={regenerating}
        title="Regenerar so este diagrama (gasta poucos tokens)"
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 border border-slate-600/40 text-slate-200 text-xs disabled:opacity-50 ${className}`}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
        {regenerating ? "Regenerando…" : "Regenerar"}
      </button>
    ) : null;

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setSvg("");
    setZoom(1);
    const run = async () => {
      try {
        // Valida ANTES de renderizar. mermaid.parse com suppressErrors retorna
        // false (sem lancar e SEM injetar o "Syntax error in text" no DOM) se o
        // codigo for invalido — ai caimos no fallback limpo (mostra o codigo).
        const code = quoteRiskyLabels(chart);
        const ok = await mermaid.parse(code, { suppressErrors: true });
        if (ok === false) throw new Error("mermaid: sintaxe invalida");
        const id = `mermaid-${++idSeq}`;
        const { svg: out } = await mermaid.render(id, code);
        if (!cancelled) setSvg(out);
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
      <div className="my-5 rounded-xl border border-amber-500/30 bg-slate-900/80 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-amber-500/20">
          <span className="text-[12px] text-amber-300/90">Diagrama com erro de sintaxe</span>
          <RegenBtn />
        </div>
        {regenError && <div className="px-3 pt-2 text-[11px] text-red-300">{regenError}</div>}
        <pre className="p-4 overflow-x-auto text-[13px] font-mono text-slate-400">{chart}</pre>
      </div>
    );
  }

  // Mesma logica de apresentacao do FlowDiagram: moldura com fundo pontilhado +
  // botao de tela cheia; fullscreen num portal com o mesmo canvas.
  const svgCls = "[&_svg]:h-auto [&_svg]:mx-auto [&_svg]:block";

  return (
    <>
      <div className="my-6 relative w-full rounded-xl border border-slate-700/40 overflow-hidden" style={DOT_BG}>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
          <RegenBtn />
          <button
            onClick={() => setFull(true)}
            title="Ver em tela cheia"
            className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 border border-slate-600/40 text-slate-300"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        {regenError && <div className="absolute top-12 right-2 z-10 text-[11px] text-red-300 bg-slate-900/90 px-2 py-1 rounded">{regenError}</div>}
        <ZoomControls onIn={zoomIn} onOut={zoomOut} onReset={zoomReset} />
        <PanScroll className="overflow-auto p-4" style={{ maxHeight: 440 }}>
          <SvgHost svg={svg} zoom={zoom} className={svgCls} />
        </PanScroll>
      </div>

      {full && createPortal(
        <div className="fixed inset-0 z-[120] bg-slate-950 flex flex-col">
          <div className="flex items-center justify-end px-3 py-2 border-b border-slate-800">
            <button
              onClick={() => setFull(false)}
              title="Fechar"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm"
            >
              <X className="w-4 h-4" /> Fechar
            </button>
          </div>
          <div className="relative flex-1 min-h-0" style={DOT_BG}>
            <ZoomControls onIn={zoomIn} onOut={zoomOut} onReset={zoomReset} />
            <PanScroll className="h-full overflow-auto p-6">
              <SvgHost svg={svg} zoom={zoom} className={svgCls} />
            </PanScroll>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

// Mindmap -> FlowDiagram (mesmo padrao visual da biblioteca principal); os demais
// tipos (flowchart/sequence/class/state/er) seguem no Mermaid nativo estilizado.
const MermaidDiagram = ({ chart, onRegenerate }) => {
  // Memoiza por `chart` (string estavel): evita recriar o spec do mindmap a cada
  // render do pai — junto com a chave estavel do FlowDiagram, mata o "piscar".
  const spec = useMemo(() => mindmapToSpec(chart), [chart]);
  return spec ? <FlowDiagram spec={spec} /> : <MermaidNative chart={chart} onRegenerate={onRegenerate} />;
};

export default MermaidDiagram;
