import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ReactFlow, Background, Controls, Handle, Position, getStraightPath, useInternalNode, BaseEdge, EdgeLabelRenderer } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { Maximize2, X } from "lucide-react";

// Canvas reutilizado inline e em tela cheia. `interactive` so na tela cheia:
// la o scroll DA ZOOM; no inline o scroll ROLA A PAGINA (zoom pelos botoes).
const Canvas = ({ nodes, edges, interactive = false }) => (
  <ReactFlow
    nodes={nodes}
    edges={edges}
    nodeTypes={nodeTypes}
    edgeTypes={edgeTypes}
    fitView
    fitViewOptions={{ padding: 0.2 }}
    nodesDraggable={false}
    nodesConnectable={false}
    zoomOnScroll={interactive}
    panOnScroll={false}
    preventScrolling={interactive}
    proOptions={{ hideAttribution: true }}
  >
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
const nodeTypes = { card: CardNode };

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
    children: nodes.map((n) => ({ id: n.id, width: n.data?.w || NODE_W, height: NODE_H })),
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
    ...n, type: "card", data: { ...n.data, dir },
    position: pos[n.id] || { x: 0, y: 0 },
    sourcePosition: dir === "LR" ? Position.Right : Position.Bottom,
    targetPosition: dir === "LR" ? Position.Left : Position.Top,
  }));
  return { rfNodes, edgePoints, edgeLabelPos };
};

// Layout radial por setores (mapa mental estrela).
const radialLayout = (nodes, edges) => {
  const children = {}, parent = {};
  edges.forEach((e) => { (children[e.source] = children[e.source] || []).push(e.target); parent[e.target] = e.source; });
  const root = nodes.find((n) => !parent[n.id]) || nodes[0];
  const depth = {}, leafCount = {};
  const calc = (id, d, seen) => {
    if (seen.has(id)) return 1;
    seen.add(id); depth[id] = d;
    const ch = children[id] || [];
    if (ch.length === 0) { leafCount[id] = 1; return 1; }
    let sum = 0; ch.forEach((c) => { sum += calc(c, d + 1, seen); });
    leafCount[id] = sum; return sum;
  };
  calc(root.id, 0, new Set());
  const ang = {};
  const assign = (id, a0, a1, seen) => {
    if (seen.has(id)) return;
    seen.add(id);
    ang[id] = (a0 + a1) / 2;
    const ch = children[id] || [];
    const total = leafCount[id] || 1;
    let cur = a0;
    ch.forEach((c) => { const span = (a1 - a0) * ((leafCount[c] || 1) / total); assign(c, cur, cur + span, seen); cur += span; });
  };
  assign(root.id, -Math.PI / 2, (3 * Math.PI) / 2, new Set());
  const ringRadius = (d) => (d <= 0 ? 0 : 200 + (d - 1) * 165);
  return nodes.map((n) => {
    const d = depth[n.id] ?? 1, a = ang[n.id] ?? 0, r = ringRadius(d);
    return { ...n, type: "card", data: { ...n.data, dir: "radial" }, position: d === 0 ? { x: 0, y: 0 } : { x: Math.cos(a) * r, y: Math.sin(a) * r } };
  });
};

// Parseia + valida o spec. Retorna { ok, type, dir, rawNodes, rawEdges }.
const parseSpec = (spec) => {
  try {
    const s = typeof spec === "string" ? JSON.parse(spec) : spec;
    if (!s || !Array.isArray(s.nodes) || !Array.isArray(s.edges) || s.nodes.length === 0) return { ok: false };
    const ids = new Set(s.nodes.map((n) => n.id));
    const rawNodes = s.nodes.map((n) => ({ id: String(n.id), data: { label: n.label, kind: n.kind, w: estW(n.label) }, position: { x: 0, y: 0 } }));
    const rawEdges = s.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e, i) => ({ id: `e${i}`, source: String(e.source), target: String(e.target), label: e.label || undefined }));
    return { ok: true, type: s.type === "mindmap" ? "mindmap" : "flow", dir: s.direction === "LR" ? "LR" : "TB", rawNodes, rawEdges };
  } catch {
    return { ok: false };
  }
};

const trunc = (t) => (t && t.length > 18 ? t.slice(0, 17) + "…" : t);

const FlowDiagram = ({ spec }) => {
  const [state, setState] = useState({ status: "loading" });
  const [full, setFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const parsed = parseSpec(spec);
    if (!parsed.ok) { setState({ status: "error" }); return; }

    if (parsed.type === "mindmap") {
      const rfNodes = radialLayout(parsed.rawNodes, parsed.rawEdges);
      const rfEdges = parsed.rawEdges.map((e) => ({ ...e, type: "floating", label: undefined, style: { stroke: "#64748b", strokeWidth: 1.5 } }));
      setState({ status: "ok", rfNodes, rfEdges, isMind: true });
      return;
    }

    setState({ status: "loading" });
    elkLayout(parsed.rawNodes, parsed.rawEdges, parsed.dir)
      .then(({ rfNodes, edgePoints, edgeLabelPos }) => {
        if (cancelled) return;
        const rfEdges = parsed.rawEdges.map((e, i) => {
          const points = edgePoints[`le${i}`];
          const common = { ...e, label: trunc(e.label), style: { stroke: "#94a3b8", strokeWidth: 1.5 }, markerEnd: { type: "arrowclosed", color: "#94a3b8" } };
          // ELK roteou? usa os pontos ortogonais + posicao de label do ELK. Senao, smoothstep.
          if (points && points.length >= 2) return { ...common, type: "elk", data: { points, labelPos: edgeLabelPos[`le${i}`] } };
          return { ...common, type: "smoothstep", pathOptions: { borderRadius: 12 }, labelStyle: { fill: "#cbd5e1", fontSize: 11 }, labelBgStyle: { fill: "#0f172a", fillOpacity: 0.92 }, labelBgPadding: [5, 2], labelBgBorderRadius: 4 };
        });
        setState({ status: "ok", rfNodes, rfEdges, isMind: false });
      })
      .catch(() => { if (!cancelled) setState({ status: "error" }); });

    return () => { cancelled = true; };
  }, [spec]);

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
