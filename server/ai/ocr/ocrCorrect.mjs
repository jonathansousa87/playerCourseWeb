// Correção de transcrição com vocabulário canônico do OCR.
//
// Casa garble ( WhisperX ouviu errado ) <-> canônico ( OCR da tela acertou ).
// A ancoragem é na TELA: o `to` veio do OCR, nao do palpite do Qwen.
// Determinístico + auditável. Substitui a ancoragem heurística da F1 para código.
//
// Estratégia:
// 1. Pra cada token do vocabulário OCR, verifica se existe um garble proximo
//    na transcrição (similaridade por distância de Levenshtein normalizada,
//    threshold alto para evitar falsos positivos).
// 2. So troca se o garble for muito similar (<=2 edits) E o canônico parecer
//    identificador técnico (CamelCase, /, etc.).
// 3. Word-boundary para nunca corromper palavra legitima.
//
// O vocabulário OCR é a VERDADE da tela. Se o WhisperX transcreveu "/alf"
// e o OCR diz "/auth", a correção é determinística e auditável.

// Distância de Levenshtein (matriz 2xN, in-place).
const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
};

// Similaridade normalizada: 1.0 = identico, 0.0 = completamente diferente.
const similarity = (a, b) => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
};

// Parece um identificador técnico: CamelCase (tem maiúscula no meio) ou
// tem caractere especial (/auth, client-id, .java).
const looksTechnical = (s) => /[A-Z]/.test(s) && /[a-z]/.test(s) || /[^a-zA-Z0-9]/.test(s);

// Nao é palavra comum em PT/EN (evita trocar "data", "set", etc.).
// Reusa a stoplist da F1 se disponível, mas localmente também.
const COMMON_WORDS = new Set([
  'data', 'set', 'get', 'post', 'put', 'user', 'up', 'down', 'plus', 'minus',
  'length', 'size', 'list', 'name', 'type', 'value', 'key', 'item', 'field',
  'line', 'point', 'table', 'base', 'case', 'main', 'end', 'start', 'run',
  'test', 'code', 'file', 'path', 'node', 'map', 'call', 'time', 'date', 'text',
  'word', 'part', 'step', 'flow', 'unit', 'task', 'role', 'rule', 'note',
  'link', 'tool', 'mode', 'area', 'side', 'kind', 'sort', 'load', 'save',
  'edit', 'view', 'form', 'page', 'class', 'event', 'count', 'index', 'order',
  'group', 'level', 'state', 'the', 'and', 'for', 'you', 'are', 'how', 'is',
  'it', 'on', 'to', 'in', 'of', 'as', 'at', 'by', 'or', 'an', 'no',
]);

// Tira pontuação das bordas pra comparar tokens limpos.
const bareTok = (s) => (s || '').replace(/^[^\w/]+|[^\w/)]+$/g, '');

// Monta o mapa de correção: para cada canônico do vocabulário, procura um
// garble na transcrição. Retorna [{ from, to, source: 'ocr' }] — o `from` é
// o garble (palavra que aparece na transcrição), o `to` é o canônico do OCR.
//
// O casamento é por similaridade: se um token da transcrição é MUITO parecido
// com um canônico do OCR (mas não igual), e o canônico é técnico, troca.
// Se o token da transcrição já é igual a um canônico, nao precisa (já correto).
const buildOcrCorrectionMap = (transcript, vocabulary, { log = () => {} } = {}) => {
  if (!transcript || !vocabulary.length) return [];

  // Tokeniza a transcrição (palavras inteiras, com pontuação de borda).
  const tokens = new Set();
  for (const w of transcript.split(/[\s,.!?;:()"'`]+/)) {
    const t = w.trim();
    if (t.length >= 3) tokens.add(t);
  }

  const map = [];
  const seen = new Set(); // garble ja mapeado (case-insensitive)

  for (const canonical of vocabulary) {
    const canon = bareTok(canonical);
    if (!canon || canon.length < 3) continue;
    if (!looksTechnical(canon)) continue; // so corrige p/ identificadores técnicos

    // Procura um token na transcrição que seja muito parecido com o canônico
    // mas não igual (se for igual, já está correto, nao precisa corrigir).
    let bestGarble = null;
    let bestSim = 0;
    const canonLower = canon.toLowerCase();

    for (const tok of tokens) {
      const tokLower = tok.toLowerCase();
      if (tokLower === canonLower) continue; // já correto
      // So casa tokens de tamanho parecido (±2 chars ou ±30%)
      const lenDiff = Math.abs(tok.length - canon.length);
      if (lenDiff > 2 && lenDiff > Math.ceil(canon.length * 0.3)) continue;
      const sim = similarity(tokLower, canonLower);
      // Threshold alto: o garble tem que ser MUITO parecido com o canônico
      // (ex.: alf <-> auth = 0.75, mas data <-> data = 1.0 = igual, ja filtrado)
      if (sim >= 0.7 && sim > bestSim) {
        // Garble nao pode ser palavra comum (senao corrompe texto legitimo)
        if (COMMON_WORDS.has(tokLower)) continue;
        bestGarble = tok;
        bestSim = sim;
      }
    }

    if (bestGarble) {
      const garbleLower = bestGarble.toLowerCase();
      if (seen.has(garbleLower)) continue;
      seen.add(garbleLower);
      map.push({ from: bestGarble, to: canon, source: 'ocr', sim: bestSim.toFixed(2) });
    }
  }

  if (map.length) {
    log(`[ocr-correct] ${map.length} correções ancoradas no OCR: ${map.map((m) => `${m.from}->${m.to}`).join(', ')}`);
  }
  return map;
};

// Aplica o mapa de correção de forma DETERMINÍSTICA (word-boundary), igual ao
// applyNorm da F1. So tokens INTEIROS para nunca corromper palavra legitima.
export const applyOcrCorrections = (text, map) => {
  let out = text;
  for (const { from, to } of map || []) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\w])${esc}(?![\\w])`, 'g'), to);
  }
  return out;
};

// API: recebe a transcrição + vocabulário OCR, devolve a transcrição corrigida
// e o mapa aplicado (para auditoria/log).
export const correctTranscriptWithOcr = (transcript, vocabulary, opts = {}) => {
  const map = buildOcrCorrectionMap(transcript, vocabulary, opts);
  if (!map.length) return { text: transcript, map: [] };
  const text = applyOcrCorrections(transcript, map);
  return { text, map };
};
