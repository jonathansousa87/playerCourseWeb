// Detector ENDURECIDO de inconsistencia de nomenclatura entre aulas de leitura.
// Sem lista fixa de nomes. Duas camadas:
//   CAMADA 1 (gratis, JS): extrai identificadores de codigo de cada aula e agrupa
//     por SIMILARIDADE DE STRING (case-insensitive, tokens CamelCase). Pega
//     variantes lexicais proximas (SecurityConfig vs WebSecurityConfig).
//   CAMADA 2 (Qwen local, gratis): agrupa por SEMANTICA os que a string nao pega
//     (TokenService == JwtTokenProvider). Degrada gracioso se o servidor estiver fora.

const LOCAL_URL = (process.env.PRECONDENSE_URL || 'http://127.0.0.1:8080/v1/chat/completions').trim();
const LOCAL_MODEL = (process.env.PRECONDENSE_MODEL || 'local').trim();

// --- extracao dinamica de artefatos de uma aula ---
export const extractArtifacts = (text) => {
  const classes = new Set();
  // CamelCase com 2+ "corcovas" (TokenService, JwtTokenProvider, LoginDTO); evita ACRONIMOS (REST, JSON).
  // Ignora anotacoes (@PostMapping): match precedido por '@' nao e classe.
  for (const m of text.matchAll(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b/g)) {
    if (text[m.index - 1] !== '@') classes.add(m[0]);
  }
  const annotations = new Set();
  for (const m of text.matchAll(/@[A-Z][A-Za-z0-9]+/g)) annotations.add(m[0]);
  const endpoints = new Set();
  // paths em aspas ou em @XxxMapping("/...")
  for (const m of text.matchAll(/["'(]\s*(\/[A-Za-z][\w./-]*)/g)) endpoints.add(m[1].replace(/[.,)]+$/, ''));
  for (const m of text.matchAll(/Mapping\(\s*["'](\/[^"']*)/g)) endpoints.add(m[1]);
  return { classes, annotations, endpoints };
};

// tokeniza CamelCase -> palavras minusculas
const tokenize = (name) =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// radical: nome sem sufixos de implementacao (Impl/Interface/etc). TokenService e
// TokenServiceImpl tem o MESMO radical -> nao e drift, e interface+impl.
const SUFFIX = new Set(['impl', 'interface', 'abstract', 'base', 'default', 'imp']);
const stem = (name) => tokenize(name).filter((t) => !SUFFIX.has(t)).join('');
// um grupo so e DRIFT real se tem 2+ RADICAIS distintos.
const isDrift = (group) => new Set(group.map(stem)).size > 1;
const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
};

// union-find simples
const makeUF = (keys) => {
  const p = new Map(keys.map((k) => [k, k]));
  const find = (x) => { while (p.get(x) !== x) { p.set(x, p.get(p.get(x))); x = p.get(x); } return x; };
  const union = (a, b) => { p.set(find(a), find(b)); };
  return { find, union, groups: () => {
    const g = new Map();
    for (const k of keys) { const r = find(k); (g.get(r) || g.set(r, []).get(r)).push(k); }
    return [...g.values()];
  } };
};

// CAMADA 1: agrupa nomes de classe por similaridade de string. Retorna clusters
// e um mapa nome->aulas em que aparece.
export const stringClusterClasses = (perLesson, threshold = 0.5) => {
  const appears = new Map(); // nome -> Set(idxAula)
  perLesson.forEach((set, i) => set.forEach((n) => (appears.get(n) || appears.set(n, new Set()).get(n)).add(i)));
  const names = [...appears.keys()];
  const uf = makeUF(names);
  const tokens = new Map(names.map((n) => [n, tokenize(n)]));
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    if (jaccard(tokens.get(names[i]), tokens.get(names[j])) >= threshold) uf.union(names[i], names[j]);
  }
  return { appears, clusters: uf.groups().filter((g) => g.length > 1) };
};

// CAMADA 2: linker semantico via Qwen local. Recebe a lista de identificadores e
// pede pra agrupar os que sao o MESMO artefato com nomes diferentes.
export const semanticLink = async (identifiers, { timeoutMs = 180000, think = false } = {}) => {
  const list = [...new Set(identifiers)];
  if (list.length < 2) return { ok: true, groups: [] };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const userMsg = `Identifiers:\n${list.join('\n')}\n\nReturn JSON: {"groups": [["NameA","NameB"], ...]} — only groups with 2+ names that denote the SAME artifact. If none, return {"groups": []}.${think ? ' /think' : ' /no_think'}`;
    const body = {
      model: LOCAL_MODEL,
      messages: [
        { role: 'system', content: 'You group code identifiers that refer to the SAME artifact/role but under DIFFERENT names, across the reading lessons of ONE course module. Only group TRUE synonyms of the same thing (e.g. a token service named two ways). Request vs Response, DTOs of different data, and different exception types are DIFFERENT — do NOT group them. Reply ONLY with pure JSON.' },
        { role: 'user', content: userMsg },
      ],
      temperature: 0, max_tokens: think ? 8000 : 1500, stream: false,
    };
    if (think) body.chat_template_kwargs = { enable_thinking: true };
    const res = await fetch(LOCAL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let raw = data?.choices?.[0]?.message?.content || '';
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, ''); // remove o bloco de raciocinio
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    return { ok: true, groups: (j.groups || []).filter((g) => Array.isArray(g) && g.length > 1) };
  } catch (err) {
    return { ok: false, error: err.message, groups: [] }; // degrada: Qwen fora
  } finally { clearTimeout(t); }
};

// Junta camada 1 + (opcional) camada 2 e conta o DRIFT: grupos com 2+ nomes
// distintos que aparecem no conjunto de aulas.
export const driftReport = async (perLessonArtifacts, { useSemantic = true, think = false } = {}) => {
  const classSets = perLessonArtifacts.map((a) => a.classes);
  const { appears, clusters } = stringClusterClasses(classSets);
  const endpoints = [...new Set(perLessonArtifacts.flatMap((a) => [...a.endpoints]))];

  let semantic = { ok: false, groups: [] };
  if (useSemantic) {
    // manda classes + endpoints pro linker semantico
    semantic = await semanticLink([...appears.keys(), ...endpoints], { think });
  }

  // consolida grupos (string-clusters + semantic-groups), deduplica e mantem so
  // os que sao DRIFT real (2+ radicais distintos — ignora interface/impl).
  const norm = (g) => [...new Set(g)].filter(Boolean);
  const groups = [...clusters, ...semantic.groups].map(norm).filter((g) => g.length > 1 && isDrift(g));
  return { appears, endpoints, stringClusters: clusters, semantic, driftGroups: groups, driftCount: groups.length };
};
