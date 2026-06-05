// Layout do teclado ABNT2 (PT-BR) + mapa de dedos para o teclado virtual.
// O objetivo pedagogico e' ensinar qual dedo usa cada tecla (touch typing),
// entao cada tecla carrega um id de dedo e os dedos tem cores fixas.

// Dedos: L=left R=right, P=mindinho A=anelar M=medio I=indicador, TH=polegar.
export const FINGERS = {
  LP: { name: "Mindinho esq.", color: "#f87171" },
  LA: { name: "Anelar esq.", color: "#fb923c" },
  LM: { name: "Medio esq.", color: "#fbbf24" },
  LI: { name: "Indicador esq.", color: "#34d399" },
  RI: { name: "Indicador dir.", color: "#22d3ee" },
  RM: { name: "Medio dir.", color: "#60a5fa" },
  RA: { name: "Anelar dir.", color: "#a78bfa" },
  RP: { name: "Mindinho dir.", color: "#f472b6" },
  TH: { name: "Polegar", color: "#94a3b8" },
};

// k(label, finger, extras) — cria a definicao de uma tecla.
// base: caractere produzido sem shift (pra casar com o texto). dead: tecla morta
// (acento). special: tecla de controle (sem caractere). home: tecla-ancora.
const k = (label, finger, extra = {}) => ({ label, finger, ...extra });

// Linhas fisicas do ABNT2 (apenas o bloco alfanumerico).
export const KEYBOARD_ROWS = [
  [
    k("'", "LP", { base: "'" }), k("1", "LP", { base: "1" }), k("2", "LA", { base: "2" }),
    k("3", "LM", { base: "3" }), k("4", "LI", { base: "4" }), k("5", "LI", { base: "5" }),
    k("6", "RI", { base: "6" }), k("7", "RI", { base: "7" }), k("8", "RM", { base: "8" }),
    k("9", "RA", { base: "9" }), k("0", "RP", { base: "0" }), k("-", "RP", { base: "-" }),
    k("=", "RP", { base: "=" }), k("Backspace", "RP", { special: true, w: 2 }),
  ],
  [
    k("Tab", "LP", { special: true, w: 1.5 }),
    k("Q", "LP", { base: "q" }), k("W", "LA", { base: "w" }), k("E", "LM", { base: "e" }),
    k("R", "LI", { base: "r" }), k("T", "LI", { base: "t" }), k("Y", "RI", { base: "y" }),
    k("U", "RI", { base: "u" }), k("I", "RM", { base: "i" }), k("O", "RA", { base: "o" }),
    k("P", "RP", { base: "p" }), k("´", "RP", { dead: "acute" }), k("[", "RP", { base: "[" }),
  ],
  [
    k("Caps", "LP", { special: true, w: 1.75 }),
    k("A", "LP", { base: "a" }), k("S", "LA", { base: "s" }), k("D", "LM", { base: "d" }),
    k("F", "LI", { base: "f", home: true }), k("G", "LI", { base: "g" }),
    k("H", "RI", { base: "h" }), k("J", "RI", { base: "j", home: true }),
    k("K", "RM", { base: "k" }), k("L", "RA", { base: "l" }), k("Ç", "RP", { base: "ç" }),
    k("~", "RP", { dead: "tilde" }), k("Enter", "RP", { special: true, w: 1.5 }),
  ],
  [
    k("Shift", "LP", { special: true, w: 1.5 }),
    k("\\", "LP", { base: "\\" }), k("Z", "LP", { base: "z" }), k("X", "LA", { base: "x" }),
    k("C", "LM", { base: "c" }), k("V", "LI", { base: "v" }), k("B", "LI", { base: "b" }),
    k("N", "RI", { base: "n" }), k("M", "RI", { base: "m" }), k(",", "RM", { base: "," }),
    k(".", "RA", { base: "." }), k(";", "RP", { base: ";" }), k("/", "RP", { base: "/" }),
    k("Shift", "RP", { special: true, w: 2.25, side: "right" }),
  ],
  [k("Espaco", "TH", { base: " ", special: true, w: 8 })],
];

// Mapa base-char -> { label, finger } (apenas teclas com caractere direto).
const BASE_MAP = {};
for (const row of KEYBOARD_ROWS) {
  for (const key of row) {
    if (key.base !== undefined) BASE_MAP[key.base] = { label: key.label, finger: key.finger };
  }
}

// Composicao de acentos no ABNT2 (tecla morta + letra).
// acute = tecla ´ ; tilde = tecla ~ ; circ = Shift+~ ; grave = Shift+´
const ACCENTS = {
  á: ["acute", "a"], é: ["acute", "e"], í: ["acute", "i"], ó: ["acute", "o"], ú: ["acute", "u"],
  ã: ["tilde", "a"], õ: ["tilde", "o"], ñ: ["tilde", "n"],
  â: ["circ", "a"], ê: ["circ", "e"], ô: ["circ", "o"],
  à: ["grave", "a"],
};

const DEAD_LABEL = { acute: "´", tilde: "~", circ: "~", grave: "´" };
const DEAD_SHIFT = { acute: false, tilde: false, circ: true, grave: true };

// Simbolos que saem com Shift + tecla base (cobre os mais comuns do ABNT2).
const SHIFT_SYMBOLS = {
  "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "¨": "6", "&": "7",
  "*": "8", "(": "9", ")": "0", _: "-", "+": "=", "?": "/", ":": ";",
  '"': "'", ">": ".", "<": ",",
};

// charToSteps(ch) -> { steps:[{label,finger,shift}], hint }
// steps e' a sequencia de teclas fisicas a pressionar. O teclado virtual
// destaca todas; a primeira e' a "proxima acao".
export const charToSteps = (ch) => {
  if (ch === undefined || ch === null) return { steps: [], hint: "" };
  if (ch === " ") return { steps: [{ label: "Espaco", finger: "TH" }], hint: "barra de espaco" };

  // Acentuados (tecla morta + letra)
  const accent = ACCENTS[ch];
  if (accent) {
    const [dead, letter] = accent;
    const base = BASE_MAP[letter] || {};
    return {
      steps: [
        { label: DEAD_LABEL[dead], finger: "RP", shift: DEAD_SHIFT[dead] },
        { label: base.label, finger: base.finger },
      ],
      hint: `${DEAD_LABEL[dead]} ${DEAD_SHIFT[dead] ? "(Shift) " : ""}depois ${base.label}`,
    };
  }

  // Maiusculas: Shift (mao oposta) + letra
  if (/[A-ZÀ-Ý]/.test(ch) && ch.toLowerCase() !== ch) {
    return charToStepsShiftLetter(ch.toLowerCase());
  }

  // Simbolos com Shift
  if (SHIFT_SYMBOLS[ch]) {
    const base = BASE_MAP[SHIFT_SYMBOLS[ch]] || {};
    return { steps: [{ label: base.label, finger: base.finger, shift: true }], hint: `Shift + ${base.label}` };
  }

  // Direto
  const base = BASE_MAP[ch];
  if (base) return { steps: [{ label: base.label, finger: base.finger }], hint: base.label };

  return { steps: [], hint: "" };
};

const charToStepsShiftLetter = (lower) => {
  // Acentuada maiuscula (ex: Á) — trata a letra base; mantem simples.
  if (ACCENTS[lower]) {
    const r = charToSteps(lower);
    return { steps: r.steps, hint: r.hint };
  }
  const base = BASE_MAP[lower] || {};
  return { steps: [{ label: base.label, finger: base.finger, shift: true }], hint: `Shift + ${base.label}` };
};
