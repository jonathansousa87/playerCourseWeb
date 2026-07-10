// Extrai diagramas estruturados de frames de vídeo usando o Qwen3-VL.
//
// O VL recebe o frame (screenshot de um diagrama na tela do curso) e devolve
// JSON { type, notation, nodes, edges } — copiando os labels EXATOS. Daí
// geramos Mermaid fiel ao diagrama desenhado (em vez de inferir só da fala).
//
// Sempre roda PaddleOCR PRIMEIRO (o usuario pediu: ambos os OCRs em todo frame,
// extrair o máximo possível). O VL roda DEPOIS em todos os frames que tenham
// conteúdo visual (texto OU diagrama) — ele pega o texto que o Paddle perdeu
// e também a estrutura dos diagramas.

import { askVl } from './visionServer.mjs';

// Prompt de OCR de código/texto (igual ao spikeOcrVL.mjs, validado). Ganhou uma
// linha extra de trailer ("DIAGRAM: yes/no") pra servir de DETECTOR: a mesma
// chamada (mesma imagem, ja codificada) decide se vale a pena disparar o
// DIAGRAM_PROMPT (caro, 2000 tokens) depois. Sem isso, o VL rodava a extracao
// de diagrama em TODO frame — mas a maioria dos frames de uma aula tecnica e
// codigo/slide, sem diagrama nenhum.
const OCR_PROMPT = 'You are reading a screenshot of an IDE (IntelliJ) showing Java code and a project tree. Transcribe EXACTLY the technical identifiers visible on screen — class names, method names, HTTP endpoints/routes (e.g. "/auth"), package names, annotations, file names, SQL/migration names. Copy the spelling CHARACTER BY CHARACTER as shown; do NOT correct, translate, or infer. Output a plain list, one identifier per line, nothing else. Then, on the LAST line, output EXACTLY "DIAGRAM: yes" if this screen shows a flowchart, diagram, UML, mind map, or architecture diagram, or "DIAGRAM: no" otherwise.';

// Prompt de extração de diagrama (igual ao spikeVLdual.mjs, validado no DFD Yourdon).
const DIAGRAM_PROMPT = 'This image is a diagram (likely a Data Flow Diagram). Extract its STRUCTURE. Output STRICT JSON only, no prose: {"type": "...", "notation": "...", "nodes": [{"label": "...", "kind": "external_entity|process|data_store"}], "edges": [{"from": "...", "to": "...", "label": "..."}]}. Copy every label EXACTLY as written on the diagram. Include ALL nodes and ALL arrows.';

// Extrai o trailer "DIAGRAM: yes/no" do texto do OCR e devolve { text (sem o
// trailer), hasDiagram }. Resposta ausente/malformada -> assume TRUE (degrada
// gracioso: nunca perde diagrama por falha de parse, so gasta 1 chamada a mais).
const DIAGRAM_TRAILER_RE = /\n?\s*DIAGRAM:\s*(yes|no)\s*$/i;
const stripDiagramTrailer = (text) => {
  const m = DIAGRAM_TRAILER_RE.exec(text || '');
  if (!m) return { text: text || '', hasDiagram: true };
  return { text: text.slice(0, m.index), hasDiagram: m[1].toLowerCase() === 'yes' };
};

// Tenta parsear o JSON do VL de forma tolerante (tira fences, extrai objeto).
const parseJsonLoose = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.indexOf('{');
    const b = cleaned.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(cleaned.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

// Gera Mermaid a partir do JSON { type, notation, nodes, edges }.
// Best-effort: se nao parsear ou estiver vazio, devolve ''.
const toMermaid = (json) => {
  if (!json || !Array.isArray(json.nodes) || json.nodes.length === 0) return '';
  const { type, notation, nodes, edges } = json;
  // Mapeia kind -> shape do Mermaidflowchart
  // Se for DFD (Yourdon): external_entity = [label], process = (label), data_store = [()label]
  const isDfd = /flow.*diagram|dfd/i.test(type || '') || /yourdon|gane/i.test(notation || '');
  const shape = (node) => {
    const label = (node.label || '').replace(/"/g, "'");
    if (isDfd) {
      switch (node.kind) {
        case 'external_entity': return `["${label}"]`;
        case 'data_store': return `[("${label}")]`;
        case 'process':
        default: return `("${label}")`;
      }
    }
    // default: flowchart retangulo
    return `["${label}"]`;
  };

  const lines = [`flowchart ${isDfd ? 'TD' : 'TD'}`];
  // IDs alfanumericos curtos
  const ids = new Map();
  nodes.forEach((n, i) => {
    const id = `n${i}`;
    ids.set(n.label, id);
    lines.push(`  ${id}${shape(n)}`);
  });
  for (const e of edges || []) {
    const from = ids.get(e.from);
    const to = ids.get(e.to);
    if (!from || !to) continue; // pula arestas com nodes que nao existem
    const label = (e.label || '').trim().replace(/"/g, "'");
    if (label) lines.push(`  ${from} -->|${label}| ${to}`);
    else lines.push(`  ${from} --> ${to}`);
  }
  return lines.join('\n');
};

// Dedup de diagramas quase-identicos: frames consecutivos do mesmo trecho de
// video tendem a extrair o MESMO diagrama varias vezes (o presenter fala em
// cima dele por varios segundos). Agrupa por sobreposicao de labels dos nodes
// (Jaccard > 0.85) e mantem so o de MAIS nodes/edges de cada grupo (o mais
// completo). Puramente em JS sobre dado ja extraido — sem chamada de modelo.
const nodeLabelSet = (d) => new Set((d.mermaid.match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1).trim().toLowerCase()));
const jaccard = (a, b) => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
};
const dedupeDiagrams = (list) => {
  const withSets = list.map((d) => ({ d, set: nodeLabelSet(d), size: d.mermaid.split('\n').length }));
  const kept = [];
  for (const item of withSets) {
    const match = kept.find((k) => jaccard(k.set, item.set) > 0.85);
    if (!match) kept.push(item);
    else if (item.size > match.size) Object.assign(match, item); // troca pelo mais completo
  }
  return kept.map((k) => k.d);
};

// Extrai diagramas + texto complementar de frames via Qwen3-VL.
// Retorna { mermaid: [...], vocab: [...], raw: [...] }.
// `frames` = lista de paths de PNG. `askVl` = injetado (testabilidade).
export const extractDiagrams = async ({ frames = [], log = () => {} } = {}) => {
  if (!frames.length) return { mermaid: [], vocab: [], raw: [] };

  const mermaid = [];
  const vocab = [];
  const raw = [];
  let skipped = 0;

  for (const f of frames) {
    log(`[vl] OCR+deteccao de diagrama: ${f.split('/').pop()}`);
    try {
      // 1. OCR de texto/código (igual ao spike, pega o que o Paddle perdeu) +
      // deteccao de diagrama (trailer "DIAGRAM: yes/no" na mesma chamada).
      const ocrRaw = await askVl({ imagePath: f, prompt: OCR_PROMPT, maxTokens: 1200 });
      const { text: ocrText, hasDiagram } = stripDiagramTrailer(ocrRaw);
      if (ocrText) {
        raw.push({ file: f.split('/').pop(), ocr: ocrText });
        for (const line of ocrText.split('\n')) {
          const s = line.trim().replace(/^[-*\d.\s]+/, '');
          if (s.length >= 2) vocab.push(s);
        }
      }
      // 2. Extração de diagrama — SO se o detector (passo 1) disse que tem.
      if (!hasDiagram) { skipped += 1; continue; }
      const diagText = await askVl({ imagePath: f, prompt: DIAGRAM_PROMPT, maxTokens: 2000 });
      if (diagText) {
        const json = parseJsonLoose(diagText);
        if (json) {
          const m = toMermaid(json);
          if (m) mermaid.push({ file: f.split('/').pop(), mermaid: m, type: json.type, notation: json.notation });
          // Nodes/edges labels tambem entram no vocabulário (sao identificadores)
          for (const n of json.nodes || []) if (n.label) vocab.push(n.label);
        }
      }
    } catch (err) {
      log(`[vl] erro em ${f.split('/').pop()}: ${err.message}`);
    }
  }
  const deduped = dedupeDiagrams(mermaid);
  log(`[vl] ${deduped.length} diagramas (${mermaid.length - deduped.length} duplicata(s) removida(s)), ${vocab.length} tokens de texto/estrutura extraidos, ${skipped}/${frames.length} frame(s) sem diagrama pularam a extração`);
  return { mermaid: deduped, vocab, raw };
};
