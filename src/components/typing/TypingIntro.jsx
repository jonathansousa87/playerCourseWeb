import React from "react";
import { ArrowLeft, ArrowRight, Armchair, Monitor, Hand, Clock } from "lucide-react";
import { FINGERS } from "../../typing/keyboardLayout";

// Introducao de postura/ergonomia do curso de digitacao. Ilustracoes em SVG
// proprio (sem imagem externa) — postura sentada (vista lateral) e posicao das
// maos na linha base (vista de cima). Boas praticas de ergonomia (OSHA/UCLA
// Health/ergonomistas): tela na altura dos olhos, cotovelos 90-110, pulsos
// retos sem apoiar, pes no chao, dedos curvados na home row.
const TypingIntro = ({ onBack, onStart }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 sticky top-0 z-10 bg-slate-900/60 backdrop-blur-sm">
        <div className="w-full max-w-5xl mx-auto px-6 lg:px-10 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/40 text-slate-200 text-xs font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <h1 className="text-lg font-bold text-slate-100">Postura e posicao das maos</h1>
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto px-6 lg:px-10 py-8 space-y-8">
        <p className="text-sm text-slate-400 max-w-2xl">
          Antes de digitar, ajuste o corpo e as maos. A postura certa evita dores,
          deixa os dedos livres para alcancar as teclas e e a base para digitar
          rapido sem olhar para o teclado.
        </p>

        {/* Ilustracoes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <figure className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
            <PostureSvg />
            <figcaption className="text-xs text-slate-400 text-center mt-2">
              Postura sentada — vista lateral
            </figcaption>
          </figure>
          <figure className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
            <HandsSvg />
            <figcaption className="text-xs text-slate-400 text-center mt-2">
              Maos na linha base — vista de cima (cada dedo tem sua cor)
            </figcaption>
          </figure>
        </div>

        {/* Boas praticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TipBlock icon={Armchair} title="Cadeira e corpo">
            <li>Costas retas e apoiadas no encosto; ombros relaxados.</li>
            <li>Quadris na altura ou um pouco acima dos joelhos.</li>
            <li>Pes totalmente apoiados no chao (ou em um apoio).</li>
          </TipBlock>
          <TipBlock icon={Hand} title="Bracos e pulsos">
            <li>Cotovelos junto ao corpo, abertos a 90-110.</li>
            <li>Antebracos paralelos ao chao; teclado na altura dos cotovelos.</li>
            <li>Pulsos retos e flutuando — nao apoie nem dobre ao digitar.</li>
          </TipBlock>
          <TipBlock icon={Monitor} title="Tela">
            <li>Topo do monitor na altura (ou logo abaixo) dos olhos.</li>
            <li>Distancia de uns 50 a 70 cm; pescoco neutro, sem inclinar.</li>
            <li>Olhe para a tela, nunca para o teclado.</li>
          </TipBlock>
          <TipBlock icon={Clock} title="Maos e habitos">
            <li>Dedos curvados na linha base: a s d f / j k l c.</li>
            <li>Indicadores em F e J (tem a saliencia-guia); polegares no espaco.</li>
            <li>Regra 20-20-20 e pausas a cada 20-30 min. Precisao antes de velocidade.</li>
          </TipBlock>
        </div>

        <div className="flex justify-center pt-2">
          <button
            onClick={onStart}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-200 border border-cyan-500/40 font-medium transition"
          >
            Comecar pela linha base <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
};

const TipBlock = ({ icon: Icon, title, children }) => (
  <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5">
    <div className="flex items-center gap-2 mb-3">
      <div className="p-1.5 rounded-lg bg-cyan-500/15">
        <Icon className="w-4 h-4 text-cyan-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
    </div>
    <ul className="space-y-1.5 text-sm text-slate-400 list-disc pl-5 marker:text-cyan-500/60">
      {children}
    </ul>
  </div>
);

// ── Postura sentada (vista lateral) ───────────────────────────────────────
const PostureSvg = () => {
  const limb = { stroke: "#cbd5e1", strokeWidth: 7, strokeLinecap: "round", fill: "none" };
  const muted = "#64748b";
  return (
    <svg viewBox="0 0 320 240" className="w-full h-auto" role="img" aria-label="Ilustracao de postura sentada">
      {/* chao */}
      <line x1="24" y1="210" x2="312" y2="210" stroke={muted} strokeWidth="2" />

      {/* mesa, teclado, monitor */}
      <rect x="158" y="150" width="150" height="6" rx="2" fill="#475569" />
      <line x1="300" y1="156" x2="300" y2="210" stroke="#475569" strokeWidth="4" />
      <rect x="172" y="143" width="46" height="7" rx="2" fill="#334155" />
      <rect x="276" y="124" width="8" height="26" fill="#475569" />
      <rect x="248" y="82" width="60" height="44" rx="4" fill="#1e293b" stroke="#475569" strokeWidth="2" />
      <rect x="253" y="87" width="50" height="34" rx="2" fill="#0ea5e9" opacity="0.18" />

      {/* linha do nivel dos olhos */}
      <line x1="128" y1="84" x2="308" y2="84" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
      <text x="150" y="78" fontSize="9" fill="#67e8f9">topo da tela na altura dos olhos</text>

      {/* cadeira */}
      <rect x="86" y="150" width="72" height="6" rx="2" fill="#334155" />
      <rect x="80" y="104" width="7" height="52" rx="3" fill="#334155" />
      <line x1="120" y1="156" x2="120" y2="200" stroke="#334155" strokeWidth="4" />
      <line x1="104" y1="200" x2="140" y2="200" stroke="#334155" strokeWidth="4" strokeLinecap="round" />

      {/* pessoa (de lado, virada para a tela) */}
      <circle cx="120" cy="72" r="15" fill="#cbd5e1" />
      <path d="M122 86 L113 150" {...limb} />            {/* costas */}
      <path d="M121 92 L119 131" {...limb} />            {/* braco */}
      <path d="M119 131 L181 145" {...limb} />           {/* antebraco ate o teclado */}
      <path d="M113 150 L158 153" {...limb} />           {/* coxa */}
      <path d="M158 153 L160 206" {...limb} />           {/* perna */}
      <path d="M160 206 L182 206" {...limb} />           {/* pe */}

      {/* marcadores de angulo */}
      <path d="M126 131 A12 12 0 0 1 119 143" fill="none" stroke="#fbbf24" strokeWidth="1.5" />
      <text x="86" y="126" fontSize="9" fill="#fbbf24">cotovelo 90-110</text>
      <path d="M150 153 A12 12 0 0 1 158 165" fill="none" stroke="#fbbf24" strokeWidth="1.5" />

      {/* rotulos */}
      <text x="170" y="138" fontSize="9" fill="#94a3b8">pulsos retos</text>
      <text x="150" y="202" fontSize="9" fill="#94a3b8">pes no chao</text>
      <text x="30" y="120" fontSize="9" fill="#94a3b8">costas retas</text>
    </svg>
  );
};

// ── Maos na linha base (vista de cima) ────────────────────────────────────
const HOME_KEYS = [
  { label: "a", finger: "LP" }, { label: "s", finger: "LA" }, { label: "d", finger: "LM" },
  { label: "f", finger: "LI", home: true }, { label: "g", finger: "LI" }, { label: "h", finger: "RI" },
  { label: "j", finger: "RI", home: true }, { label: "k", finger: "RM" }, { label: "l", finger: "RA" },
  { label: "ç", finger: "RP" },
];

const HandsSvg = () => {
  const KW = 26;
  const x0 = 18;
  const keyY = 150;
  const cx = (i) => x0 + i * (KW + 4) + KW / 2;

  // Dedos que pousam: indice -> apenas f e j (g/h sao alcance do indicador).
  const restFingers = [
    { i: 0, finger: "LP" }, { i: 1, finger: "LA" }, { i: 2, finger: "LM" }, { i: 3, finger: "LI" },
    { i: 6, finger: "RI" }, { i: 7, finger: "RM" }, { i: 8, finger: "RA" }, { i: 9, finger: "RP" },
  ];

  return (
    <svg viewBox="0 0 330 210" className="w-full h-auto" role="img" aria-label="Ilustracao das maos na linha base">
      {/* palmas */}
      <rect x="36" y="58" width="98" height="46" rx="20" fill="#334155" opacity="0.55" />
      <rect x="196" y="58" width="98" height="46" rx="20" fill="#334155" opacity="0.55" />

      {/* dedos (linha grossa colorida + ponta) ate as teclas f/j etc */}
      {restFingers.map(({ i, finger }) => {
        const color = FINGERS[finger].color;
        const x = cx(i);
        return (
          <g key={i}>
            <line x1={x} y1="100" x2={x} y2={keyY - 6} stroke={color} strokeWidth="9" strokeLinecap="round" opacity="0.85" />
            <circle cx={x} cy={keyY - 6} r="7" fill={color} />
          </g>
        );
      })}

      {/* polegares -> barra de espaco */}
      <line x1="120" y1="102" x2="150" y2="176" stroke={FINGERS.TH.color} strokeWidth="9" strokeLinecap="round" opacity="0.85" />
      <line x1="210" y1="102" x2="180" y2="176" stroke={FINGERS.TH.color} strokeWidth="9" strokeLinecap="round" opacity="0.85" />

      {/* teclas da linha base */}
      {HOME_KEYS.map((k, i) => {
        const color = FINGERS[k.finger].color;
        const x = x0 + i * (KW + 4);
        return (
          <g key={i}>
            <rect x={x} y={keyY} width={KW} height={KW} rx="4" fill="#1e293b" stroke={color} strokeWidth="1.5" />
            <text x={x + KW / 2} y={keyY + 18} fontSize="13" fill={color} textAnchor="middle" fontWeight="700">
              {k.label}
            </text>
            {k.home && (
              <rect x={x + KW / 2 - 5} y={keyY + KW - 6} width="10" height="2.5" rx="1.25" fill={color} />
            )}
          </g>
        );
      })}

      {/* barra de espaco */}
      <rect x="108" y="184" width="114" height="16" rx="4" fill="#1e293b" stroke={FINGERS.TH.color} strokeWidth="1.5" />
      <text x="165" y="196" fontSize="10" fill={FINGERS.TH.color} textAnchor="middle">espaco (polegares)</text>

      {/* nota */}
      <text x="165" y="30" fontSize="10" fill="#94a3b8" textAnchor="middle">
        Indicadores em F e J (tem a saliencia-guia)
      </text>
    </svg>
  );
};

export default TypingIntro;
