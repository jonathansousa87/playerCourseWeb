// Curriculo do curso de digitacao (touch typing) — PT-BR / teclado ABNT2.
// Ordem baseada em boas praticas (typing.com, how-to-type, Peter's, Ratatype):
// linha base primeiro como ancora, introducao progressiva de teclas, precisao
// antes de velocidade, depois maiusculas, acentos, pontuacao, numeros e por fim
// palavras, frases e testes cronometrados. Sem distracao ludica — so o texto.
//
// PRATICA CUMULATIVA (estilo typing.com): cada licao de introducao de teclas
// pratica as teclas NOVAS e tambem revisa, embaralhado, TODAS as teclas ja
// liberadas ate ali (F, J e espaco aparecem desde o inicio e seguem em tudo).
// As lições de introducao sao geradas por buildDrill de forma deterministica.
//
// Cada licao: { id, title, tip, focus (teclas novas), text (alvo a digitar) }.

// PRNG deterministico (mulberry32) — mesma saida em todo carregamento.
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Gera o texto de um treino de teclas. opts controla o "modo":
// - isolate: comeca isolando a tecla nova (kkk) e combinando com as ancoras F/J;
// - count/maxLen: quantidade e tamanho dos blocos (lic5oes mais avancadas sao
//   mais longas); newBias: o quanto sorteia das teclas novas vs. do pool todo.
// A revisao e' SEMPRE cumulativa: os blocos sorteiam de TODAS as teclas ja
// aprendidas (pool + novas).
const buildDrill = (newKeys, pool, seed, opts = {}) => {
  const { isolate = false, count = 24, minLen = 2, maxLen = 3, newBias = 0.5 } = opts;
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const all = [...pool, ...newKeys];
  const tokens = [];

  if (isolate) {
    for (const key of newKeys) tokens.push(key.repeat(3));
    for (const key of newKeys) tokens.push("f" + key, key + "j", key + "f", "j" + key);
    if (newKeys.length === 2) tokens.push(newKeys.join(""), newKeys[1] + newKeys[0]);
  }

  for (let i = 0; i < count; i++) {
    const len = minLen + Math.floor(rnd() * (maxLen - minLen + 1));
    let w = "";
    for (let j = 0; j < len; j++) {
      w += rnd() < newBias ? pick(newKeys) : pick(all);
    }
    tokens.push(w);
  }
  return tokens.join(" ");
};

// Os 5 treinos de cada modulo de teclas (mesmas teclas, dificuldade crescente).
const MODES = [
  { label: "teclas novas", isolate: true, count: 10, maxLen: 2, newBias: 0.7,
    tip: (m) => m.tip },
  { label: "combinacoes", isolate: true, count: 18, maxLen: 3, newBias: 0.6,
    tip: () => "Alterne as teclas novas sem olhar. Volte sempre a F e J." },
  { label: "mistura", isolate: false, count: 22, maxLen: 3, newBias: 0.45,
    tip: () => "Agora misturado com tudo que ja aprendeu. Ache o dedo certo." },
  { label: "ritmo", isolate: false, count: 28, maxLen: 3, newBias: 0.4,
    tip: () => "Mantenha um ritmo regular e constante ate o fim." },
  { label: "treino", isolate: false, count: 34, maxLen: 4, newBias: 0.45,
    tip: () => "Treino mais longo: foco total em acertar de primeira." },
];

// Sequencia de introducao de teclas (em ordem). O pool acumula entre todas —
// inclusive atravessando os estagios — garantindo revisao cumulativa real.
const INTRO_SEQUENCE = [
  { id: "base-fj", title: "Ancoras F e J", keys: ["f", "j"], tip: "Indicadores nas teclas com saliencia (F e J). Nao olhe para o teclado." },
  { id: "base-dk", title: "Medios: D e K", keys: ["d", "k"], tip: "Dedos medios. Volte sempre os indicadores para F e J." },
  { id: "base-sl", title: "Anelares: S e L", keys: ["s", "l"], tip: "Dedos anelares. Toque leve e retorne a base." },
  { id: "base-ac", title: "Mindinhos: A e Ç", keys: ["a", "ç"], tip: "Mindinhos nas pontas. O Ç fica a direita do L (mindinho direito)." },
  { id: "base-gh", title: "Indicadores: G e H", keys: ["g", "h"], tip: "Indicadores se esticam para o centro e voltam a F e J." },
  { id: "top-ei", title: "E e I", keys: ["e", "i"], tip: "E = medio esq., I = medio dir. Suba e volte a base." },
  { id: "top-ru", title: "R e U", keys: ["r", "u"], tip: "R = indicador esq., U = indicador dir." },
  { id: "top-ty", title: "T e Y", keys: ["t", "y"], tip: "T e Y sao alcancados pelos indicadores esticando." },
  { id: "top-wo", title: "W e O", keys: ["w", "o"], tip: "W = anelar esq., O = anelar dir." },
  { id: "top-qp", title: "Q e P", keys: ["q", "p"], tip: "Q = mindinho esq., P = mindinho dir." },
  { id: "bot-vb", title: "V e B", keys: ["v", "b"], tip: "V e B sao do indicador esquerdo." },
  { id: "bot-nm", title: "N e M", keys: ["n", "m"], tip: "N e M sao do indicador direito." },
  { id: "bot-cx", title: "C e X", keys: ["c", "x"], tip: "C = medio esq., X = anelar esq." },
];

// Gera os 5 treinos de cada modulo (ids `${modulo}-1..5`), acumulando o pool.
const INTRO = {};
{
  let pool = [];
  INTRO_SEQUENCE.forEach((m, idx) => {
    INTRO[m.id] = MODES.map((mode, i) => ({
      id: `${m.id}-${i + 1}`,
      title: `${m.title} · ${mode.label}`,
      tip: mode.tip(m),
      focus: m.keys,
      text: buildDrill(m.keys, pool, idx * 10 + i + 1, mode),
    }));
    pool = [...pool, ...m.keys];
  });
}

export const TYPING_STAGES = [
  {
    stage: "Linha base",
    subtitle: "Os dedos moram aqui: a s d f g h j k l ç. F e J tem a saliencia-guia.",
    lessons: [
      ...INTRO["base-fj"],
      ...INTRO["base-dk"],
      ...INTRO["base-sl"],
      ...INTRO["base-ac"],
      ...INTRO["base-gh"],
      {
        id: "base-rev",
        title: "Revisao da linha base",
        focus: ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ç"],
        tip: "Toda a linha base. Ritmo constante vale mais que pressa.",
        text: "asdf jklç asdf jklç gh fg hj fdsa çlkj as df jk lç ag hl sk dj af jç gd hk asdfgh hjklç fj dk sl aç gh",
      },
    ],
  },
  {
    stage: "Linha superior",
    subtitle: "Suba para q w e r t y u i o p, sempre revisando a base ja aprendida.",
    lessons: [
      ...INTRO["top-ei"],
      ...INTRO["top-ru"],
      ...INTRO["top-ty"],
      ...INTRO["top-wo"],
      ...INTRO["top-qp"],
      {
        id: "top-words",
        title: "Primeiras palavras",
        focus: [],
        tip: "Misture base + superior em palavras reais. Olhe so para a tela.",
        text: "sala dado dito fato gato lado rota loja seda fila reta aula data raiz tua sua dela este toda hora porta festa",
      },
    ],
  },
  {
    stage: "Linha inferior",
    subtitle: "Desca para z x c v b n m , . revisando tudo que ja passou.",
    lessons: [
      ...INTRO["bot-vb"],
      ...INTRO["bot-nm"],
      ...INTRO["bot-cx"],
      {
        id: "bot-z",
        title: "Z e a virgula",
        focus: ["z", ","],
        tip: "Z = mindinho esq.; a virgula = medio dir.",
        text: "zzz ,,, az, ez, iz, zelo, zona, voz, faz, luz, z, z, oba, sim, nao, vez, paz, raiz, z, z, zz ,,",
      },
      {
        id: "bot-words",
        title: "Palavras com toda a base",
        focus: [],
        tip: "Todas as letras minusculas ja entram aqui.",
        text: "bom voz boi base bola caco nove vez zona vida mundo nunca campo tempo nome novo mesmo banco verbo nuvem dez",
      },
    ],
  },
  {
    stage: "Revisao das letras",
    subtitle: "Frases simples para fixar todas as letras antes de avancar.",
    lessons: [
      { id: "rev-1", title: "Frases leves", focus: [], tip: "Sem maiusculas e sem acentos ainda. Foco no dedo certo.",
        text: "o rato roeu a roupa do rei a velha casa fica no fim da rua larga e calma sob o sol da tarde de junho" },
      { id: "rev-2", title: "Mais fluidez", focus: [], tip: "Mantenha um ritmo regular, sem paradas longas.",
        text: "um pequeno jabuti xereta viu dez cegonhas felizes a voar sobre o lago calmo e bonito do velho vale verde" },
    ],
  },
  {
    stage: "Maiusculas (Shift)",
    subtitle: "Regra de ouro: Shift com o mindinho da mao OPOSTA a da letra.",
    lessons: [
      { id: "shift-names", title: "Nomes proprios", focus: ["Shift"], tip: "Letra na direita -> Shift esquerdo; letra na esquerda -> Shift direito.",
        text: "Ana Bia Caio Davi Edu Gil Hugo Ivo Joao Kaue Lia Mia Nina Otto Paulo Rui Sara Tom Vera Yuri" },
      { id: "shift-sentences", title: "Inicio de frase", focus: ["Shift"], tip: "So a primeira letra maiuscula. Solte o Shift logo apos.",
        text: "O Sol nasce no leste. A Lua brilha de noite. Os Rios correm para o mar. Todos os Dias trazem algo novo." },
      { id: "shift-places", title: "Lugares do Brasil", focus: ["Shift"], tip: "Cada palavra comeca com maiuscula. Use o Shift oposto.",
        text: "Brasil Bahia Recife Salvador Manaus Belem Natal Curitiba Goiania Palmas Vitoria Fortaleza Porto Alegre" },
    ],
  },
  {
    stage: "Acentuacao",
    subtitle: "No ABNT2 o acento e tecla morta: aperte o acento, depois a letra.",
    lessons: [
      { id: "ac-agudo", title: "Acento agudo (´)", focus: ["´"], tip: "Tecla ´ (a direita do P), depois a vogal: ´ + a = a com agudo.",
        text: "já vá só é até café saída série fácil único após válido líquido público sólido aqui ali ótimo nível início" },
      { id: "ac-til", title: "Til (~)", focus: ["~"], tip: "Tecla ~ (a direita do Ç), depois a vogal: ~ + a = a com til.",
        text: "não mão pão irmã então visão razão limões botões ações lições opinião região alemão cidadão irmãos" },
      { id: "ac-circ", title: "Circunflexo (^)", focus: ["^"], tip: "Shift + ~ gera ^, depois a vogal: ^ + e = e com circunflexo.",
        text: "você três mês câmera lâmpada pêssego âncora ênfase fôlego bônus ônibus rever série conteúdo problema" },
      { id: "ac-cedilha", title: "Crase e cedilha", focus: ["à", "ç"], tip: "Crase: Shift+´ depois a. Ç ja e tecla propria (mindinho direito).",
        text: "à às àquele coração ação maçã força braço doçura cabeça começo serviço almoço praça licença dançar laço" },
      { id: "ac-words", title: "Texto com acentos", focus: [], tip: "Agora junte tudo: maiusculas e acentos no texto real.",
        text: "Você está indo muito bem. A prática diária traz precisão e, com o tempo, a velocidade vem naturalmente." },
    ],
  },
  {
    stage: "Pontuacao e simbolos",
    subtitle: "Sinais do dia a dia: virgula, ponto, interrogacao e companhia.",
    lessons: [
      { id: "punct-basic", title: "Pontuacao basica", focus: [",", ".", "?", "!", ";", ":"], tip: "Apos virgula e ponto, um espaco. Mantenha o ritmo.",
        text: "Olá, tudo bem? Sim, claro! Vamos lá. Um, dois, três. Pare; depois siga. Atenção: foco total no texto." },
      { id: "punct-symbols", title: "Simbolos comuns", focus: ["@", "/", "%", "#", "-", "+"], tip: "Muitos saem com Shift. Procure o dedo, nao a tecla.",
        text: "email: nome@site.com (teste) 50% de uso #foco a/b +1 -2 *ok* 1+1=2 ponto a-ponto fim de linha." },
    ],
  },
  {
    stage: "Numeros",
    subtitle: "Linha de cima. Cada dedo sobe para o seu numero e volta a base.",
    lessons: [
      { id: "num-1", title: "Numeros 1 a 0", focus: ["1","2","3","4","5","6","7","8","9","0"], tip: "Esq: 1 2 3 4 5 / Dir: 6 7 8 9 0. Volte sempre a base.",
        text: "1 2 3 4 5 6 7 8 9 0 12 34 56 78 90 10 20 30 40 50 60 70 80 90 100 123 456 789 11 22 33 44 55 66 77 88 99 00" },
      { id: "num-2", title: "Numeros no contexto", focus: [], tip: "Numeros misturados com texto e pontuacao.",
        text: "Telefone 9 8765 4321, CEP 01234 567, data 07/09/2025, valor 1.250,00 reais, sala 305, voo 1407, ano 2026." },
    ],
  },
  {
    stage: "Palavras frequentes",
    subtitle: "As palavras mais comuns do portugues, para ganhar fluencia.",
    lessons: [
      { id: "freq-1", title: "Top palavras (1)", focus: [], tip: "Palavras curtas e frequentes. Deixe os dedos memorizarem.",
        text: "que de não o a e do da em um para com uma os no se na por mais as dos como mas ao ele das à seu sua ou muito" },
      { id: "freq-2", title: "Top palavras (2)", focus: [], tip: "Conectores e palavras comuns do dia a dia.",
        text: "então também depois agora sempre entre cada mesmo onde porque ainda outro tempo vida parte forma grupo modo" },
    ],
  },
  {
    stage: "Frases e paragrafos",
    subtitle: "Texto corrido real, com tudo que voce ja aprendeu.",
    lessons: [
      { id: "sent-1", title: "Frase completa (1)", focus: [], tip: "Pontuacao, maiusculas e acentos juntos. Sem olhar o teclado.",
        text: "A prática constante leva à perfeição, então digite todos os dias com calma, atenção e postura correta." },
      { id: "sent-2", title: "Frase completa (2)", focus: [], tip: "Respire e mantenha o ritmo ate o fim da frase.",
        text: "Manter os dedos na linha base e olhar somente para a tela é o segredo de uma digitação rápida e precisa." },
      { id: "sent-3", title: "Frase completa (3)", focus: [], tip: "Acentos e cedilha aparecem naturalmente. Confie nos dedos.",
        text: "O Brasil é um país enorme, cheio de cores, sabores e pessoas que adoram conversar, sorrir e receber bem." },
    ],
  },
  {
    stage: "Testes cronometrados",
    subtitle: "Paragrafos maiores para medir seu WPM e sua precisao.",
    lessons: [
      { id: "test-1", title: "Teste de velocidade (1)", focus: [], tip: "Va com calma: precisao acima de velocidade sempre vence.",
        text: "Aprender a digitar com os dez dedos muda a forma como você trabalha no computador. No começo parece lento e estranho, mas a memória dos dedos se forma rápido com a prática diária. Em poucas semanas, suas mãos encontram as teclas sozinhas." },
      { id: "test-2", title: "Teste de velocidade (2)", focus: [], tip: "Tente nao corrigir o tempo todo: foque em acertar de primeira.",
        text: "A boa postura ajuda muito: costas retas, pés no chão, pulsos leves e a tela na altura dos olhos. Faça pausas curtas a cada vinte minutos para descansar as mãos. Com constância, digitar vira algo automático, e você escreve no ritmo do seu pensamento." },
    ],
  },
];

// Lista achatada e contagem total (usadas na home e no calculo de progresso).
export const TYPING_LESSONS = TYPING_STAGES.flatMap((s) =>
  s.lessons.map((l) => ({ ...l, stage: s.stage })),
);

export const TYPING_TOTAL = TYPING_LESSONS.length;

export const TYPING_PASS_ACCURACY = 95;

// Faixas de WPM para colorir a marca de cada licao (precisao >= 95% pressuposta).
// Base: media adulta ~40-55; 50-60 nivel de escritorio; 60-80 acima da media;
// 80+ excelente. Para um aprendiz, 3 faixas uteis: <30 ruim, 30-59 razoavel,
// >=60 excelente (boa meta para uso diario).
export const TYPING_WPM_TIERS = [
  { key: "bad", min: 0, color: "#f87171", label: "Ruim", range: "< 30" },
  { key: "fair", min: 30, color: "#fb923c", label: "Razoavel", range: "30–59" },
  { key: "good", min: 60, color: "#34d399", label: "Excelente", range: "≥ 60" },
];

// Retorna a faixa do WPM informado (ou null se ainda nao houve tentativa).
export const wpmTier = (wpm) => {
  if (!wpm || wpm <= 0) return null;
  if (wpm < 30) return TYPING_WPM_TIERS[0];
  if (wpm < 60) return TYPING_WPM_TIERS[1];
  return TYPING_WPM_TIERS[2];
};
