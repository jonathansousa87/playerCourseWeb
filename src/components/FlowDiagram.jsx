import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ReactFlow, Background, Controls, Handle, Position, getStraightPath, useInternalNode, BaseEdge, EdgeLabelRenderer } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { Maximize2, X } from "lucide-react";

// Canvas reutilizado inline e em tela cheia. `interactive` so na tela cheia:
// la o scroll DA ZOOM; no inline o scroll ROLA A PAGINA (zoom pelos botoes).
const FIT_VIEW_OPTS = { padding: 0.2 }; // estavel (evita re-fit por nova referencia)
const Canvas = ({ nodes, edges, interactive = false }) => (
  <ReactFlow
    nodes={nodes}
    edges={edges}
    nodeTypes={nodeTypes}
    edgeTypes={edgeTypes}
    fitView
    fitViewOptions={FIT_VIEW_OPTS}
    nodesDraggable={false}
    nodesConnectable={false}
    zoomOnScroll={interactive}
    panOnScroll={false}
    preventScrolling={interactive}
    proOptions={{ hideAttribution: true }}
  >
    <UmlMarkers />
    <Background color="#1e293b" gap={20} />
    <Controls showInteractive={false} />
  </ReactFlow>
);

// Render de diagrama a partir de um JSON { type, direction, nodes, edges } gerado
// pela IA. type "flow" usa ELK (layered, minimiza cruzamentos — dagre esta
// deprecated); type "mindmap" usa layout radial estrela. Estilo deterministico.

const elk = new ELK();
const NODE_W = 170, NODE_H = 56;
// largura estimada pelo texto — usada IGUAL no ELK e no render, pra a aresta
// tocar exatamente a borda do no (senao sobra/falta e a linha nao conecta).
const estW = (label) => Math.max(110, Math.min(230, String(label || "").length * 7.6 + 34));

const KIND_STYLE = {
  entity: { background: "#1e293b", border: "2px solid #94a3b8", borderRadius: 8, color: "#e8eef6" },
  process: { background: "#0e2a3f", border: "2px solid #38bdf8", borderRadius: 999, color: "#e0f2fe" },
  store: { background: "#1f2937", border: "2px solid #a78bfa", borderRadius: 6, borderLeft: "6px solid #a78bfa", color: "#ede9fe" },
  decision: { background: "#3a2a0e", border: "2px solid #fbbf24", borderRadius: 6, color: "#fef3c7" },
  step: { background: "#0f2a22", border: "2px solid #34d399", borderRadius: 10, color: "#d1fae5" },
  root: { background: "#064e3b", border: "2px solid #34d399", borderRadius: 12, color: "#ecfdf5", fontWeight: 700 },
  branch: { background: "#0e2a3f", border: "2px solid #38bdf8", borderRadius: 10, color: "#e0f2fe" },
  leaf: { background: "#1e293b", border: "1px solid #64748b", borderRadius: 8, color: "#cbd5e1" },
};

const CardNode = ({ data }) => {
  const lr = data.dir === "LR";
  return (
    <div style={{ ...(KIND_STYLE[data.kind] || KIND_STYLE.entity), width: data.w || NODE_W, height: NODE_H, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px", fontSize: 13, fontWeight: 500, textAlign: "center", boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }}>
      <Handle type="target" position={lr ? Position.Left : Position.Top} style={{ opacity: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{data.label}</span>
      <Handle type="source" position={lr ? Position.Right : Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};
// No de CLASSE UML/DDD: estereotipo + nome + atributos (compartimentos).
const ClassNode = ({ data }) => {
  const lr = data.dir === "LR";
  return (
    <div style={{ width: data.w || 190, background: "#1e293b", border: "1.5px solid #64748b", borderRadius: 6, color: "#e8eef6", boxShadow: "0 6px 18px rgba(0,0,0,0.35)", overflow: "hidden", fontSize: 12 }}>
      <Handle type="target" position={lr ? Position.Left : Position.Top} style={{ opacity: 0 }} />
      <div style={{ padding: "6px 10px", textAlign: "center", borderBottom: data.attrs?.length ? "1px solid #475569" : "none", background: "#0f2a3f" }}>
        {data.stereotype && <div style={{ fontSize: 10, color: "#93c5fd", fontStyle: "italic" }}>«{data.stereotype}»</div>}
        <div style={{ fontWeight: 700 }}>{data.name}</div>
      </div>
      {data.attrs?.length > 0 && (
        <div style={{ padding: "5px 10px", lineHeight: 1.55, color: "#cbd5e1" }}>
          {data.attrs.map((a, i) => (
            <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a}</div>
          ))}
        </div>
      )}
      <Handle type="source" position={lr ? Position.Right : Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};
const nodeTypes = { card: CardNode, classNode: ClassNode };

// Marcadores UML (ponta da aresta no lado do "todo"/"pai").
const UmlMarkers = () => (
  <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
    <defs>
      <marker id="uml-inherit" markerWidth="16" markerHeight="14" refX="13" refY="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1,1 L13,6 L1,11 Z" fill="#0f172a" stroke="#94a3b8" strokeWidth="1" />
      </marker>
      <marker id="uml-compos" markerWidth="22" markerHeight="12" refX="17" refY="5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1,5 L9,1 L17,5 L9,9 Z" fill="#94a3b8" stroke="#94a3b8" />
      </marker>
      <marker id="uml-aggreg" markerWidth="22" markerHeight="12" refX="17" refY="5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1,5 L9,1 L17,5 L9,9 Z" fill="#0f172a" stroke="#94a3b8" />
      </marker>
      <marker id="uml-assoc" markerWidth="14" markerHeight="12" refX="9" refY="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M2,2 L10,6 L2,10" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
      </marker>
    </defs>
  </svg>
);
const REL_MARKER = { inheritance: "url(#uml-inherit)", composition: "url(#uml-compos)", aggregation: "url(#uml-aggreg)", association: "url(#uml-assoc)" };

// Aresta reta flutuante (mapa mental): sai da borda na direcao do outro no.
const nodeCenter = (n) => ({ x: n.internals.positionAbsolute.x + (n.measured?.width || NODE_W) / 2, y: n.internals.positionAbsolute.y + (n.measured?.height || NODE_H) / 2 });
const edgePoint = (node, other) => {
  const w = (node.measured?.width || NODE_W) / 2, h = (node.measured?.height || NODE_H) / 2;
  const c = nodeCenter(node), o = nodeCenter(other);
  const dx = o.x - c.x, dy = o.y - c.y;
  const scale = Math.min(w / (Math.abs(dx) || 1e-6), h / (Math.abs(dy) || 1e-6));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
};
const FloatingEdge = ({ id, source, target, style }) => {
  const s = useInternalNode(source), t = useInternalNode(target);
  if (!s || !t) return null;
  const sp = edgePoint(s, t), tp = edgePoint(t, s);
  const [path] = getStraightPath({ sourceX: sp.x, sourceY: sp.y, targetX: tp.x, targetY: tp.y });
  return <path id={id} d={path} style={style} className="react-flow__edge-path" fill="none" />;
};

// Aresta ORTOGONAL roteada pelo ELK: segue os pontos (bend points) que ELE
// calculou — contornam as caixas e separam ida/volta. Cantos arredondados.
const roundedOrthPath = (pts, r = 9) => {
  if (!pts || pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
    const d1 = Math.min(r, Math.hypot(p.x - prev.x, p.y - prev.y) / 2);
    const d2 = Math.min(r, Math.hypot(next.x - p.x, next.y - p.y) / 2);
    const u1 = { x: (prev.x - p.x) / (Math.hypot(prev.x - p.x, prev.y - p.y) || 1), y: (prev.y - p.y) / (Math.hypot(prev.x - p.x, prev.y - p.y) || 1) };
    const u2 = { x: (next.x - p.x) / (Math.hypot(next.x - p.x, next.y - p.y) || 1), y: (next.y - p.y) / (Math.hypot(next.x - p.x, next.y - p.y) || 1) };
    d += ` L ${p.x + u1.x * d1} ${p.y + u1.y * d1} Q ${p.x} ${p.y} ${p.x + u2.x * d2} ${p.y + u2.y * d2}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
};
const ElkEdge = ({ id, data, style, markerEnd, label }) => {
  const pts = data?.points;
  if (!pts || pts.length < 2) return null;
  const path = roundedOrthPath(pts);
  // posicao do label: a que o ELK calculou (evita colisao); senao, ponto medio.
  const mid = data?.labelPos || pts[Math.floor(pts.length / 2)];
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label && mid && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${mid.x}px,${mid.y}px)`, background: "#0f172a", color: "#cbd5e1", fontSize: 11, padding: "1px 5px", borderRadius: 4, pointerEvents: "none" }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
const edgeTypes = { floating: FloatingEdge, elk: ElkEdge };

// Layout ELK layered (fluxograma/DFD) — minimiza cruzamentos E roteia as arestas
// ortogonalmente (contornando as caixas). Retorna { nodes, edgePoints }.
const elkLayout = async (nodes, edges, dir = "TB") => {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": dir === "LR" ? "RIGHT" : "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "110",
      "elk.spacing.nodeNode": "85",
      "elk.spacing.edgeNode": "30",
      "elk.spacing.edgeEdge": "20",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.spacing.edgeLabel": "8",
    },
    children: nodes.map((n) => ({ id: n.id, width: n.data?.w || NODE_W, height: n.data?.h || NODE_H })),
    // passa os labels pro ELK posicionar (ele evita colisao entre eles).
    edges: edges.map((e, i) => {
      const lbl = e.label ? String(e.label) : "";
      return {
        id: `le${i}`, sources: [e.source], targets: [e.target],
        labels: lbl ? [{ id: `ll${i}`, text: lbl, width: Math.min(150, lbl.length * 6 + 10), height: 16 }] : [],
      };
    }),
  };
  const res = await elk.layout(graph);
  const pos = {};
  (res.children || []).forEach((c) => { pos[c.id] = { x: c.x, y: c.y }; });
  // pontos de cada aresta (start + bends + end) e posicao do label, no mesmo sistema.
  const edgePoints = {};
  const edgeLabelPos = {};
  (res.edges || []).forEach((e) => {
    const sec = (e.sections || [])[0];
    if (sec) edgePoints[e.id] = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint];
    const l = (e.labels || [])[0];
    if (l && l.x != null) edgeLabelPos[e.id] = { x: l.x + (l.width || 0) / 2, y: l.y + (l.height || 0) / 2 };
  });
  const rfNodes = nodes.map((n) => ({
    ...n, type: n.type || "card", data: { ...n.data, dir },
    position: pos[n.id] || { x: 0, y: 0 },
    sourcePosition: dir === "LR" ? Position.Right : Position.Bottom,
    targetPosition: dir === "LR" ? Position.Left : Position.Top,
  }));
  return { rfNodes, edgePoints, edgeLabelPos };
};

// Layout radial (mapa mental). Em vez de orbitar TUDO ao redor da raiz (que
// espalhava as folhas dos ramos num circulo so, sobrepostas), cada no distribui
// os filhos num LEQUE: a raiz usa o circulo inteiro; os niveis seguintes usam um
// cone apontando pra fora (direcao raiz->no), agrupando os filhos perto do pai.
const radialLayout = (nodes, edges) => {
  const children = {}, parent = {};
  edges.forEach((e) => { (children[e.source] = children[e.source] || []).push(e.target); parent[e.target] = e.source; });
  const root = nodes.find((n) => !parent[n.id]) || nodes[0];

  // nº de folhas por subarvore -> peso angular de cada ramo (ramos maiores
  // recebem um setor proporcionalmente maior).
  const leaf = {};
  const countLeaves = (id, seen) => {
    if (seen.has(id)) return 1;
    seen.add(id);
    const ch = children[id] || [];
    leaf[id] = ch.length ? ch.reduce((s, c) => s + countLeaves(c, seen), 0) : 1;
    return leaf[id];
  };
  countLeaves(root.id, new Set());

  const pos = { [root.id]: { x: 0, y: 0 } };
  // Raio ADITIVO (em vez de RING*(depth+1)): encurta as linhas puxando o 1o anel
  // pra perto da raiz. CUIDADO: STEP e a distancia radial entre niveis e, em
  // ramos colineares (filho na mesma direcao do pai), precisa folgar a LARGURA do
  // card (~200px), senao as caixas se sobrepoem. Por isso STEP fica perto do
  // incremento original (280); quem encurta de fato e o RING menor.
  const RING = 220; // raio do 1o anel (raiz -> ramo) — menor = mais compacto
  const STEP = 260; // incremento por nivel adicional (>= largura do card)
  // `dir` = direcao do leque; `half` = meia-abertura (raiz: PI = 360°; demais: 60°).
  const place = (id, depth, dir, half, seen) => {
    if (seen.has(id)) return;
    seen.add(id);
    const ch = children[id] || [];
    if (!ch.length) return;
    const total = ch.reduce((s, c) => s + (leaf[c] || 1), 0) || 1;
    let cur = dir - half;
    for (const c of ch) {
      const span = (2 * half) * ((leaf[c] || 1) / total);
      const a = cur + span / 2;
      const r = RING + depth * STEP;
      pos[c] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      // netos: cone de ate 120°, mas NUNCA maior que o setor do proprio ramo
      // (span) — senao ramos vizinhos invadem um ao outro e as folhas colidem.
      place(c, depth + 1, a, Math.min(Math.PI / 3, span / 2), seen);
      cur += span;
    }
  };
  place(root.id, 0, Math.PI / 2, Math.PI, new Set());

  return nodes.map((n) => ({
    ...n, type: "card", data: { ...n.data, dir: "radial" },
    position: pos[n.id] || { x: 0, y: 0 },
  }));
};

// Parseia + valida o spec. Retorna { ok, type, dir, rawNodes, rawEdges }.
const parseSpec = (spec) => {
  try {
    const s = typeof spec === "string" ? JSON.parse(spec) : spec;
    if (!s || !Array.isArray(s.nodes) || !Array.isArray(s.edges) || s.nodes.length === 0) return { ok: false };
    const ids = new Set(s.nodes.map((n) => n.id));
    const dir = s.direction === "LR" ? "LR" : "TB";

    // Diagrama de CLASSES UML/DDD: nos com estereotipo + atributos; arestas com
    // tipo de relacao (heranca/composicao/agregacao/associacao) + multiplicidade.
    if (s.type === "classes") {
      const rawNodes = s.nodes.map((n) => {
        const attrs = Array.isArray(n.attrs) ? n.attrs.map(String).slice(0, 8) : [];
        const longest = Math.max(String(n.name || "").length, String(n.stereotype || "").length + 2, ...attrs.map((a) => a.length), 0);
        const w = Math.max(150, Math.min(270, longest * 6.6 + 26));
        const h = 28 + (n.stereotype ? 13 : 0) + (attrs.length ? attrs.length * 18 + 10 : 0);
        return { id: String(n.id), type: "classNode", data: { name: n.name, stereotype: n.stereotype, attrs, w, h }, position: { x: 0, y: 0 } };
      });
      const rawEdges = s.edges
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .map((e, i) => ({ id: `e${i}`, source: String(e.source), target: String(e.target), rel: e.rel || "association", label: e.label || e.card || undefined }));
      return { ok: true, type: "classes", dir, rawNodes, rawEdges };
    }

    const rawNodes = s.nodes.map((n) => ({ id: String(n.id), data: { label: n.label, kind: n.kind, w: estW(n.label) }, position: { x: 0, y: 0 } }));
    const rawEdges = s.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e, i) => ({ id: `e${i}`, source: String(e.source), target: String(e.target), label: e.label || undefined }));
    return { ok: true, type: s.type === "mindmap" ? "mindmap" : "flow", dir, rawNodes, rawEdges };
  } catch {
    return { ok: false };
  }
};

const trunc = (t) => (t && t.length > 18 ? t.slice(0, 17) + "…" : t);

const FlowDiagram = ({ spec }) => {
  const [state, setState] = useState({ status: "loading" });
  const [full, setFull] = useState(false);

  // Chave ESTAVEL POR VALOR do spec: re-renders de ancestrais costumam recriar o
  // `spec` (objeto novo via mindmapToSpec, etc.) sem mudar o conteudo. Usar a
  // string como dep evita re-rodar o layout ELK/radial a cada render — era isso
  // que fazia o diagrama re-montar e a tela PISCAR (re-fit do ReactFlow).
  const specKey = useMemo(() => (typeof spec === "string" ? spec : JSON.stringify(spec)), [spec]);

  useEffect(() => {
    let cancelled = false;
    const parsed = parseSpec(specKey);
    if (!parsed.ok) { setState({ status: "error" }); return; }

    if (parsed.type === "mindmap") {
      const rfNodes = radialLayout(parsed.rawNodes, parsed.rawEdges);
      const rfEdges = parsed.rawEdges.map((e) => ({ ...e, type: "floating", label: undefined, style: { stroke: "#64748b", strokeWidth: 1.5 } }));
      setState({ status: "ok", rfNodes, rfEdges, isMind: true });
      return;
    }

    const isClasses = parsed.type === "classes";
    setState({ status: "loading" });
    elkLayout(parsed.rawNodes, parsed.rawEdges, parsed.dir)
      .then(({ rfNodes, edgePoints, edgeLabelPos }) => {
        if (cancelled) return;
        const rfEdges = parsed.rawEdges.map((e, i) => {
          const points = edgePoints[`le${i}`];
          // classes: marcador UML por tipo de relacao; flow/DFD: seta normal.
          const markerEnd = isClasses ? REL_MARKER[e.rel] || REL_MARKER.association : { type: "arrowclosed", color: "#94a3b8" };
          const common = { ...e, label: trunc(e.label), style: { stroke: "#94a3b8", strokeWidth: 1.5 }, markerEnd };
          if (points && points.length >= 2) return { ...common, type: "elk", data: { points, labelPos: edgeLabelPos[`le${i}`] } };
          return { ...common, type: "smoothstep", pathOptions: { borderRadius: 12 }, labelStyle: { fill: "#cbd5e1", fontSize: 11 }, labelBgStyle: { fill: "#0f172a", fillOpacity: 0.92 }, labelBgPadding: [5, 2], labelBgBorderRadius: 4 };
        });
        setState({ status: "ok", rfNodes, rfEdges, isMind: false });
      })
      .catch(() => { if (!cancelled) setState({ status: "error" }); });

    return () => { cancelled = true; };
  }, [specKey]);

  if (state.status === "error") {
    return (
      <pre className="my-5 p-4 bg-slate-900/80 border border-amber-500/30 rounded-xl overflow-x-auto text-[12px] font-mono text-slate-400">
        {typeof spec === "string" ? spec : JSON.stringify(spec, null, 2)}
      </pre>
    );
  }
  const boxCls = "my-6 w-full rounded-xl border border-slate-700/40 bg-slate-900/40 overflow-hidden";
  const height = state.isMind ? 520 : 440;

  if (state.status === "loading") {
    return <div className={`${boxCls} flex items-center justify-center text-slate-500 text-sm`} style={{ height }}>Montando diagrama…</div>;
  }

  return (
    <>
      <div className={`${boxCls} relative`} style={{ height }}>
        <button
          onClick={() => setFull(true)}
          title="Ver em tela cheia"
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 border border-slate-600/40 text-slate-300"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <Canvas nodes={state.rfNodes} edges={state.rfEdges} />
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
          <div className="flex-1 min-h-0">
            <Canvas nodes={state.rfNodes} edges={state.rfEdges} interactive />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default FlowDiagram;
