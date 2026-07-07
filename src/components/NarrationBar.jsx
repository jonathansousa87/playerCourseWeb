import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Rewind } from "lucide-react";

// Barra de audio da narracao read-along, ISOLADA do MarkdownViewer de proposito:
// o tempo do audio atualiza ~4x/s e, se isso vivesse no viewer, re-renderizaria a
// leitura inteira (e os diagramas/mapas piscavam). Aqui o re-render fica contido
// na barra; a sincronia com a leitura (realce + scroll) e feita no DOM via ref.

// Realce do trecho em reproducao: fundo azul + barra lateral. A barra (inset 3px)
// ficava POR CIMA da primeira letra -> abrimos um espaco a esquerda com paddingLeft,
// compensado por marginLeft negativo do MESMO valor pra o texto NAO deslocar quando o
// realce liga/desliga (a barra cai nesse espaco, nunca sobre a letra).
const HL_PAD = 12;
const HL = {
  background: "rgba(56,189,248,0.10)",
  boxShadow: "inset 3px 0 0 #38bdf8",
  paddingLeft: `${HL_PAD}px`,
  marginLeft: `-${HL_PAD}px`,
  borderRadius: "0 4px 4px 0",
};
const setHL = (el, on) => {
  if (!el) return;
  if (on) Object.assign(el.style, HL);
  else {
    el.style.background = "";
    el.style.boxShadow = "";
    el.style.paddingLeft = "";
    el.style.marginLeft = "";
    el.style.borderRadius = "";
  }
};
const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// Normaliza texto p/ casar trecho do audio com o elemento do DOM (sem acento,
// so minusculas/alfanumerico). Casa por PREFIXO -> tolera diferencas no fim.
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const NarrationBar = ({ audioSrc, segments, articleRef }) => {
  const audioRef = useRef(null);
  const mapRef = useRef(null); // segmento -> elemento do DOM (casado por texto)
  const activeRef = useRef(-1); // indice do segmento atual
  const activeElRef = useRef(null); // elemento realcado no momento

  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);

  // Casa cada trecho (segments, em ordem) com o elemento de texto certo do DOM
  // POR CONTEUDO (nao por ordem) — assim listas aninhadas/itens multi-linha, que
  // o ReactMarkdown agrupa diferente do parser, nao desalinham o scroll.
  const getMap = () => {
    if (mapRef.current) return mapRef.current;
    const root = articleRef.current;
    if (!root || !segments) return [];
    // IMPORTANTE: exclui texto que esta DENTRO de diagramas (Mermaid usa
    // htmlLabels -> rotulos de no viram <p>/<span> no SVG; React Flow tem labels)
    // e de blocos de codigo. Senao esses entram como "blocos" e desalinham o
    // scroll a partir do diagrama.
    const els = [...root.querySelectorAll("h1,h2,h3,h4,p,li")]
      .filter((el) => el.textContent.trim() && !el.closest("svg, foreignObject, .react-flow, pre, code"));
    const map = new Array(segments.length).fill(null);
    let p = 0;
    for (let i = 0; i < segments.length; i++) {
      const key = segments[i].text ? norm(segments[i].text).slice(0, 30) : null;
      if (!key) { map[i] = els[i] || null; continue; } // sem texto (narracao antiga) -> ordem
      let found = -1;
      // procura a partir do ponteiro, com janela curta p/ pular elementos extras.
      for (let j = p; j < els.length && j <= p + 8; j++) {
        const et = norm(els[j].textContent);
        if (et.startsWith(key) || key.startsWith(et.slice(0, 30)) || et.includes(key)) { found = j; break; }
      }
      if (found >= 0) { map[i] = els[found]; p = found + 1; } else { map[i] = null; }
    }
    mapRef.current = map;
    return map;
  };

  // Re-centraliza ao RELIGAR o "Seguir" (sem isso so voltava no proximo bloco).
  useEffect(() => {
    if (follow && audioRef.current && !audioRef.current.paused) {
      activeElRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [follow]);

  // Troca de aula/narracao -> limpa cache e realce.
  useEffect(() => {
    setHL(activeElRef.current, false);
    mapRef.current = null;
    activeRef.current = -1;
    activeElRef.current = null;
  }, [audioSrc, segments]);

  const syncActive = (t) => {
    if (!segments) return;
    let idx = -1;
    for (let i = 0; i < segments.length; i++) { if (t >= segments[i].start && t < segments[i].end) { idx = i; break; } }
    if (idx === activeRef.current) return;
    activeRef.current = idx;
    // Self-heal: se o DOM foi recriado por um re-render externo, o cache aponta p/
    // nos detached -> reconstroi o mapa em vez de "parar de seguir".
    if (mapRef.current && mapRef.current.some((el) => el && !el.isConnected)) mapRef.current = null;
    const map = getMap();
    const target = idx >= 0 ? map[idx] : null;
    // Trecho sem elemento proprio (ex.: continuacao de item de lista) -> mantem o
    // realce no bloco atual, sem piscar.
    if (!target || target === activeElRef.current) return;
    setHL(activeElRef.current, false);
    setHL(target, true);
    activeElRef.current = target;
    if (follow && !audioRef.current?.paused) target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const togglePlay = () => { const a = audioRef.current; if (!a) return; a.paused ? a.play() : a.pause(); };

  return (
    <div className="flex-shrink-0 border-t border-slate-800/60 bg-slate-900/85 backdrop-blur px-4 py-2.5">
      <div className="flex items-center gap-3 max-w-3xl mx-auto">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex-shrink-0"
          title={playing ? "Pausar" : "Ouvir a aula"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <button
          onClick={() => { const a = audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - 10); }}
          className="text-slate-400 hover:text-slate-200 flex-shrink-0" title="Voltar 10s"
        >
          <Rewind className="w-4 h-4" />
        </button>
        <span className="text-[11px] tabular-nums text-slate-400 flex-shrink-0 w-[84px] text-center">
          {fmtTime(cur)} / {fmtTime(dur)}
        </span>
        <input
          type="range" min="0" max="1000"
          value={dur ? Math.round((cur / dur) * 1000) : 0}
          onChange={(e) => { const a = audioRef.current; if (a && dur) a.currentTime = (e.target.value / 1000) * dur; }}
          className="flex-1 accent-emerald-500"
        />
        <button
          onClick={() => setFollow((v) => !v)}
          className={`text-[11px] px-2 py-1 rounded-md border flex-shrink-0 ${follow ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-slate-700 text-slate-400"}`}
          title="Rolar a pagina acompanhando a narracao"
        >
          Seguir
        </button>
        <select
          value={rate}
          onChange={(e) => { const r = parseFloat(e.target.value); setRate(r); if (audioRef.current) audioRef.current.playbackRate = r; }}
          className="text-[11px] bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-slate-300 flex-shrink-0"
          title="Velocidade"
        >
          <option value="0.85">0.85×</option>
          <option value="1">1×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
        </select>
      </div>
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => { setCur(e.currentTarget.currentTime); syncActive(e.currentTarget.currentTime); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setHL(activeElRef.current, false);
          activeRef.current = -1;
          activeElRef.current = null;
        }}
      />
    </div>
  );
};

export default NarrationBar;
