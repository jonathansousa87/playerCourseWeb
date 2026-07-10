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

// Sufixos comuns de classe Java/Spring: o OCR captura o nome da CLASSE
// (ex.: "RasmooPlusApplication"), mas a fala usa só o nome do projeto
// ("RasmooPlus"). Gera a variante sem sufixo pra comparar tambem contra ela.
const CLASS_SUFFIXES = [
  'Application', 'ServiceImpl', 'RepositoryImpl', 'Controller', 'Service',
  'Repository', 'Component', 'Configuration', 'Config', 'Exception',
  'Request', 'Response', 'Client', 'Mapper', 'Filter', 'Handler', 'Factory',
  'Builder', 'Adapter', 'Listener', 'Entity', 'Impl', 'Dto', 'DTO', 'Tests', 'Test',
];

// Devolve [canon, canon-sem-sufixo] (só quando o resto sobrando ainda parece
// um nome de verdade, >=3 chars). O canônico original continua no gate de
// looksTechnical antes de chegar aqui — a variante herda a mesma garantia
// porque só remove um sufixo CamelCase de um termo já CamelCase.
const canonicalVariants = (canon) => {
  const variants = [canon];
  for (const suf of CLASS_SUFFIXES) {
    if (canon.length > suf.length && canon.endsWith(suf)) {
      const stripped = canon.slice(0, -suf.length);
      if (stripped.length >= 3) variants.push(stripped);
      break; // um nivel de strip basta (evita over-stripping tipo Impl+Service)
    }
  }
  return variants;
};

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

  // Tokeniza a transcrição preservando ADJACENCIA REAL no texto (pra poder
  // juntar palavras vizinhas) — a fala frequentemente separa em duas
  // palavras ("Hasmo Plus") o que no OCR/código é um token só ("RasmooPlus").
  // IMPORTANTE: usa as palavras cruas (sem filtro de tamanho) pra achar pares
  // adjacentes de verdade — se filtrasse antes, "banco DE dados" juntaria
  // "banco"+"dados" como se fossem vizinhas (nao sao, tem "de" no meio).
  const rawWords = transcript.split(/[\s,.!?;:()"'`]+/).map((w) => w.trim()).filter(Boolean);
  const bigrams = new Set();
  for (let i = 0; i < rawWords.length - 1; i++) {
    const a = rawWords[i], b = rawWords[i + 1];
    if (a.length < 3 || b.length < 3) continue; // metade curta demais = ruido
    if (!/^[A-Za-zÀ-ÿ0-9/._-]+$/.test(a) || !/^[A-Za-zÀ-ÿ0-9/._-]+$/.test(b)) continue;
    // So descarta o par se AS DUAS forem comuns (ex.: "up down") — um nome
    // proprio quase sempre tem uma metade "estranha" (ex.: "Hasmo") que
    // sozinha ja nao seria comum; a outra pode ser ("Plus", "Service"...).
    if (COMMON_WORDS.has(a.toLowerCase()) && COMMON_WORDS.has(b.toLowerCase())) continue;
    bigrams.add(`${a} ${b}`); // guarda com espaço: o `from` casa a frase inteira
  }

  const singles = new Set();
  for (const w of rawWords) {
    if (w.length >= 3 && /^[A-Za-zÀ-ÿ0-9/._-]+$/.test(w)) singles.add(w);
  }

  const map = [];
  const seen = new Set(); // garble ja mapeado (case-insensitive)

  for (const canonical of vocabulary) {
    const canon = bareTok(canonical);
    if (!canon || canon.length < 3) continue;
    if (!looksTechnical(canon)) continue; // so corrige p/ identificadores técnicos

    // Procura o melhor candidato (token simples OU par de palavras juntas)
    // muito parecido com o canônico OU uma variante dele sem sufixo de
    // classe (RasmooPlusApplication -> tambem tenta RasmooPlus).
    let bestGarble = null;
    let bestSim = 0;
    let bestTo = canon;

    // Token unico: SO contra o canônico ORIGINAL (sem strip de sufixo).
    // O strip existe pra destravar o casamento com BIGRAMA (nome de
    // projeto falado em 2 palavras vs classe "XApplication" na tela);
    // usar o strip tambem aqui deixaria formas curtas demais (ex.: "Order",
    // "Product", "Error") parecidas demais com palavras comuns em PT
    // ("ordem", "produto", "erro"), aumentando falso positivo sem necessidade.
    {
      const canonLower = canon.toLowerCase();
      for (const cand of singles) {
        const candLower = cand.toLowerCase();
        if (candLower === canonLower) continue; // já correto
        const lenDiff = Math.abs(candLower.length - canonLower.length);
        if (lenDiff > 2 && lenDiff > Math.ceil(canonLower.length * 0.3)) continue;
        const sim = similarity(candLower, canonLower);
        if (sim >= 0.7 && sim > bestSim) {
          if (COMMON_WORDS.has(candLower)) continue;
          bestGarble = cand; bestSim = sim; bestTo = canon;
        }
      }
    }

    // Bigrama: contra o canônico original E as variantes sem sufixo —
    // aqui o par de palavras adjacentes já é bem mais especifico, então o
    // risco de falso positivo é bem menor mesmo com a forma mais curta.
    for (const variant of canonicalVariants(canon)) {
      const variantLower = variant.toLowerCase();
      if (variantLower.includes(' ')) continue; // bigrama so casa contra 1 token
      for (const cand of bigrams) {
        const [wordA, wordB] = cand.split(' ');
        const candJoined = cand.toLowerCase().replace(/\s+/g, '');
        if (candJoined === variantLower) continue; // já correto
        const lenDiff = Math.abs(candJoined.length - variantLower.length);
        if (lenDiff > 2 && lenDiff > Math.ceil(variantLower.length * 0.3)) continue;
        const sim = similarity(candJoined, variantLower);
        if (sim < 0.7 || sim <= bestSim) continue;
        // Se UMA das duas palavras sozinha ja bate quase perfeito com o alvo,
        // a outra e ruido adjacente (verbo/pronome) que a troca apagaria da
        // frase (ex.: "cliente tem"->"Cliente" apagaria o "tem"). So aceita
        // o par quando as DUAS palavras contribuem pro match.
        if (similarity(wordA.toLowerCase(), variantLower) >= 0.75) continue;
        if (similarity(wordB.toLowerCase(), variantLower) >= 0.75) continue;
        bestGarble = cand; bestSim = sim; bestTo = variant;
      }
    }

    if (bestGarble) {
      const garbleLower = bestGarble.toLowerCase();
      if (seen.has(garbleLower)) continue;
      seen.add(garbleLower);
      map.push({ from: bestGarble, to: bestTo, source: 'ocr', sim: bestSim.toFixed(2) });
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
    // `from` pode ser duas palavras ("Hasmo Plus"): o espaço interno vira \s+
    // pra casar mesmo se houver pontuação/espaçamento diferente no texto real.
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s,]+');
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
