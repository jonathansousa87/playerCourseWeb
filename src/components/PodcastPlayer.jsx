import React, { useEffect, useRef, useState } from "react";
import {
  Mic, GraduationCap, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Gauge,
} from "lucide-react";
import { getMediaUrl } from "../utils/fileUtils";
import { LoadingState } from "./StateViews";

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

const fmt = (s) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

// Player de audio customizado (play/pause, seek, ±10s, volume, velocidade).
const AudioPlayer = ({ src }) => {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);

  // Troca de aula: reseta o estado.
  useEffect(() => {
    setPlaying(false);
    setCur(0);
    setDur(0);
  }, [src]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const skip = (delta) => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(dur || a.duration || 0, a.currentTime + delta));
  };

  const seek = (e) => {
    const a = ref.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * dur;
    setCur(a.currentTime);
  };

  const changeRate = (r) => {
    setRate(r);
    if (ref.current) ref.current.playbackRate = r;
  };

  const toggleMute = () => {
    const a = ref.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(a.muted);
  };

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="bg-slate-950/40 border border-slate-700/40 rounded-xl p-3">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />

      {/* Barra de progresso */}
      <div
        onClick={seek}
        className="group relative h-2 bg-slate-700/60 rounded-full cursor-pointer mb-2"
      >
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => skip(-10)}
          title="Voltar 10s"
          className="p-1.5 text-slate-400 hover:text-slate-200"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={toggle}
          title={playing ? "Pausar" : "Reproduzir"}
          className="p-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white"
        >
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button
          onClick={() => skip(10)}
          title="Avancar 10s"
          className="p-1.5 text-slate-400 hover:text-slate-200"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <span className="text-xs font-mono text-slate-400 tabular-nums ml-1">
          {fmt(cur)} / {fmt(dur)}
        </span>

        <div className="flex-1" />

        <Gauge className="w-3.5 h-3.5 text-slate-500" />
        <div className="flex items-center gap-1">
          {SPEEDS.map((r) => (
            <button
              key={r}
              onClick={() => changeRate(r)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                rate === r
                  ? "bg-blue-500 text-white"
                  : "bg-slate-700/50 hover:bg-slate-700 text-slate-300"
              }`}
            >
              {r}x
            </button>
          ))}
        </div>
        <button
          onClick={toggleMute}
          title={muted ? "Ativar som" : "Silenciar"}
          className="p-1.5 text-slate-400 hover:text-slate-200"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

// Renderiza o podcast da aula: player de audio + roteiro do dialogo.
// `fileUrl` aponta pro /api/materials/.../podcast, que devolve o JSON
// { audio, title, turns:[{speaker,text}], names } como texto.
const PodcastPlayer = ({ fileUrl, courseTitle }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileUrl) return;
    setLoading(true);
    setError(null);
    fetch(fileUrl)
      .then((res) => res.text())
      .then((text) => {
        setData(JSON.parse(text));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar podcast:", err);
        setError("Nao foi possivel carregar o podcast.");
        setLoading(false);
      });
  }, [fileUrl]);

  if (loading) return <LoadingState message="Carregando podcast..." />;
  if (error) return <div className="p-8 text-center text-red-300">{error}</div>;
  if (!data) return null;

  const audioSrc = getMediaUrl(courseTitle, data.audio);

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="w-full max-w-3xl mx-auto px-4 lg:px-8 py-8">
        <div className="bg-gradient-to-r from-blue-600/15 to-indigo-600/15 border border-blue-500/20 rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/15 text-blue-300">
              <Mic className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-100">{data.title || "Podcast da aula"}</h1>
          </div>
          <AudioPlayer src={audioSrc} />
        </div>

        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Roteiro</h2>
        <div className="space-y-3">
          {(data.turns || []).map((t, i) => {
            const isSenior = t.speaker === "senior";
            const name = isSenior
              ? data.names?.senior || "Luiz"
              : data.names?.junior || "Daniela";
            return (
              <div
                key={i}
                className={`flex gap-3 ${isSenior ? "" : "flex-row-reverse text-right"}`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isSenior
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                  title={name}
                >
                  {isSenior ? <GraduationCap className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </div>
                <div className="max-w-[80%]">
                  <div
                    className={`text-[11px] font-semibold mb-0.5 ${
                      isSenior ? "text-emerald-300" : "text-amber-300"
                    }`}
                  >
                    {name}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed text-left ${
                      isSenior
                        ? "bg-slate-900/70 border border-emerald-500/15 text-slate-200"
                        : "bg-slate-900/70 border border-amber-500/15 text-slate-200"
                    }`}
                  >
                    {t.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PodcastPlayer;
