// Detecta cards com enunciados (front) similares entre si. Alvo: "confusao
// semantica" — perguntas parecidas sobre conceitos proximos que o aluno
// confunde (reflete em lapsos). Agrupar e revisar comparativamente ajuda a
// separar os conceitos na memoria.
//
// Algoritmo: tokenizacao simples + Jaccard em conjuntos de palavras + union-find
// pra montar grupos por componentes conexos. O(n^2) no numero de cards filtrados —
// OK ate ~alguns milhares; acima disso trocar por MinHash/LSH.

const STOPWORDS_PT = new Set([
  'a','o','as','os','e','ou','de','da','do','das','dos','um','uma','uns','umas',
  'que','qual','quais','como','por','para','no','na','nos','nas','em','com','se',
  'eh','ser','sao','foi','foram','ter','tem','tinha','sua','seu','suas','seus',
  'esse','essa','isso','esta','este','isto','aquele','aquela','aquilo','aqui',
  'ali','la','mais','menos','muito','pouco','ja','ainda','tambem','nem','mas',
  'porem','entao','assim','pois','entre','sem','sobre','sob','ate','apos','antes',
  'depois','durante',
]);

// Tokeniza pra minusculas, quebra em palavras, remove acentos (simples), filtra
// stopwords e tokens muito curtos.
export const tokenize = (text) => {
  if (!text) return [];
  const normalized = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const words = normalized.match(/[a-z0-9]+/g) || [];
  return words.filter((w) => w.length > 2 && !STOPWORDS_PT.has(w));
};

// Jaccard: |A intersec B| / |A uniao B|. Vazio vs vazio = 0.
export const jaccardSimilarity = (tokensA, tokensB) => {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
};

// Agrupa cards similares usando union-find. Retorna array de grupos (cada
// grupo tem >= 2 cards). Cada card esperado no shape { id, front, lapses, ... }.
// Filtra antes por `lapses >= minLapses` (foco em cards que o aluno esta
// errando muito).
export const findConfusionGroups = (
  cards,
  { threshold = 0.4, minLapses = 2 } = {},
) => {
  const filtered = cards.filter((c) => (Number(c.lapses) || 0) >= minLapses);
  const n = filtered.length;
  if (n < 2) return [];

  const tokens = filtered.map((c) => tokenize(c.front));

  // Union-find
  const parent = new Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (jaccardSimilarity(tokens[i], tokens[j]) >= threshold) {
        union(i, j);
      }
    }
  }

  const groupMap = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root).push(filtered[i]);
  }

  // Descarta componentes singleton e ordena grupos por lapses totais desc.
  const groups = [];
  for (const g of groupMap.values()) {
    if (g.length < 2) continue;
    const totalLapses = g.reduce((s, c) => s + (Number(c.lapses) || 0), 0);
    groups.push({ cards: g, totalLapses });
  }
  groups.sort((a, b) => b.totalLapses - a.totalLapses);
  return groups;
};
