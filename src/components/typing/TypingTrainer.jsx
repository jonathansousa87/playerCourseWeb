import React, { useState, useEffect, useRef, useCallback } from "react";
import { RotateCcw, ArrowRight, ArrowLeft, CheckCircle2, XCircle, Lightbulb, Volume2, VolumeX } from "lucide-react";
import VirtualKeyboard from "./VirtualKeyboard";
import { TYPING_PASS_ACCURACY } from "../../typing/curriculum";
import { playKeyClick, playKeyError } from "../../typing/typeSound";

// Motor de digitacao. Modo "trava no erro": a tecla errada conta como erro mas
// nao avanca — forca o dedo certo (boa pratica para reconstruir o habito).
// Captura caracteres (inclusive acentos via teclas mortas do ABNT2) pelo evento
// input de um campo escondido, comparando o que foi inserido com o alvo.
// O texto e' uma linha unica grande que rola na horizontal, mantendo o
// caractere atual sempre centralizado (estilo tutor de digitacao).
const TypingTrainer = ({ lesson, best, onFinish, onNext, onExit, hasNext }) => {
  const target = lesson.text;
  const inputRef = useRef(null);
  const startRef = useRef(null);
  const currentCharRef = useRef(null);

  const [pos, setPos] = useState(0);
  const [errors, setErrors] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [focused, setFocused] = useState(true);
  const [now, setNow] = useState(0); // tick para WPM ao vivo
  const [phase, setPhase] = useState("typing"); // typing | result
  const [result, setResult] = useState(null);
  const [serverResp, setServerResp] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("typingSound") !== "off";
  });

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      try {
        localStorage.setItem("typingSound", next ? "on" : "off");
      } catch { /* ignora */ }
      return next;
    });
  }, []);

  const focus = useCallback(() => inputRef.current?.focus(), []);

  // Reinicia (Repetir)
  const reset = useCallback(() => {
    setPos(0);
    setErrors(0);
    setWrongFlash(false);
    setPhase("typing");
    setResult(null);
    setServerResp(null);
    setSaveError(null);
    startRef.current = null;
    setNow(0);
    setTimeout(focus, 0);
  }, [focus]);

  // Recomeca ao trocar de licao
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  // Tick para atualizar WPM ao vivo enquanto digita
  useEffect(() => {
    if (phase !== "typing" || startRef.current === null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase, pos]);

  // Mantem o caractere atual centralizado (a linha rola na horizontal).
  useEffect(() => {
    if (phase === "typing") {
      currentCharRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [pos, phase]);

  // Na tela de resultado, Enter dispara a acao principal: proxima licao
  // (quando passou e existe), senao repete a licao atual.
  useEffect(() => {
    if (phase !== "result") return;
    const onKey = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const passed = result && result.accuracy >= TYPING_PASS_ACCURACY;
      if (passed && hasNext) onNext?.();
      else reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, result, hasNext, onNext, reset]);

  const finish = useCallback(
    async (finalErrors) => {
      const elapsedMin = Math.max((Date.now() - startRef.current) / 60000, 1 / 600);
      const correct = target.length;
      const wpm = Math.round(correct / 5 / elapsedMin);
      const accuracy = Math.round((correct / (correct + finalErrors)) * 100);
      const res = { wpm, accuracy };
      setResult(res);
      setPhase("result");
      setSaveError(null);
      try {
        const resp = await onFinish?.(res);
        if (resp) setServerResp(resp);
      } catch (err) {
        console.error("Falha ao salvar resultado:", err);
        setSaveError(err?.message || "erro desconhecido");
      }
    },
    [target, onFinish],
  );

  // Processa caracteres inseridos no campo escondido.
  const handleInput = (e) => {
    const value = e.target.value;
    e.target.value = "";
    if (!value) return;

    let p = pos;
    let err = errors;
    for (const ch of value) {
      if (p >= target.length) break;
      if (startRef.current === null) startRef.current = Date.now();
      if (ch === target[p]) {
        p += 1;
        if (soundOn) playKeyClick();
      } else {
        err += 1;
        if (soundOn) playKeyError();
        setWrongFlash(true);
        setTimeout(() => setWrongFlash(false), 150);
      }
    }
    setErrors(err);
    setPos(p);
    if (p >= target.length) finish(err);
  };

  const handleKeyDown = (e) => {
    // Bloqueia teclas que atrapalham (sem retroceder no modo trava-no-erro).
    if (e.key === "Tab") e.preventDefault();
    if (e.key === "Backspace") e.preventDefault();
  };

  // Estatisticas ao vivo
  const typedKeystrokes = pos + errors;
  const liveAccuracy = typedKeystrokes > 0 ? Math.round((pos / typedKeystrokes) * 100) : 100;
  const liveWpm =
    startRef.current && now
      ? Math.round(pos / 5 / Math.max((now - startRef.current) / 60000, 1 / 600))
      : 0;
  const progressPct = Math.round((pos / target.length) * 100);
  const expectedChar = target[pos];

  // ── Tela de resultado ──────────────────────────────────────────────────
  if (phase === "result" && result) {
    const passed = result.accuracy >= TYPING_PASS_ACCURACY;
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
            passed ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {passed ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
        </div>
        <h3 className="text-xl font-bold text-slate-100 mb-1">
          {passed ? "Licao concluida!" : "Quase la"}
        </h3>
        <p className="text-sm text-slate-400 mb-6 max-w-md">
          {passed
            ? "Precisao suficiente para avancar. Velocidade vem com a repeticao."
            : `Voce precisa de ${TYPING_PASS_ACCURACY}% de precisao para concluir. Repita com calma, focando no dedo certo.`}
        </p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <Stat label="Precisao" value={`${result.accuracy}%`} highlight={passed ? "emerald" : "amber"} />
          <Stat label="Velocidade" value={`${result.wpm} WPM`} />
          <Stat label="Erros" value={errors} />
        </div>

        {saveError && (
          <div className="max-w-md text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-6 text-left">
            Nao foi possivel salvar o progresso no banco ({saveError}). O resultado
            acima e valido, mas a licao nao sera marcada como concluida ate o backend
            estar com a migration aplicada e reiniciado.
          </div>
        )}

        {(serverResp?.lesson || best) && (
          <p className="text-xs text-slate-500 mb-6">
            Recorde: {(serverResp?.lesson?.bestWpm ?? best?.bestWpm) || 0} WPM ·{" "}
            {(serverResp?.lesson?.bestAccuracy ?? best?.bestAccuracy) || 0}% precisao
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 border border-slate-600/40 text-sm font-medium transition"
          >
            <RotateCcw className="w-4 h-4" /> Repetir
            {!(passed && hasNext) && <span className="text-xs opacity-60">(Enter)</span>}
          </button>
          {passed && hasNext && (
            <button
              onClick={onNext}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 text-sm font-medium transition"
            >
              Proxima licao <ArrowRight className="w-4 h-4" />
              <span className="text-xs opacity-70">(Enter)</span>
            </button>
          )}
          <button
            onClick={onExit}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 text-sm font-medium transition"
          >
            Voltar a lista
          </button>
        </div>
      </div>
    );
  }

  // ── Tela de digitacao ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Cabecalho da licao */}
      <div className="px-6 py-3 border-b border-slate-700/40 flex items-center justify-between gap-4">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/40 text-slate-200 text-xs font-medium transition flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" /> Lista
        </button>
        <div className="flex items-center gap-5 text-sm">
          <Live label="WPM" value={liveWpm} />
          <Live label="Precisao" value={`${liveAccuracy}%`} />
          <Live label="Progresso" value={`${progressPct}%`} />
          <button
            onClick={toggleSound}
            title={soundOn ? "Desligar som das teclas" : "Ligar som das teclas"}
            className={`flex items-center justify-center w-8 h-8 rounded-lg border transition ${
              soundOn
                ? "bg-cyan-600/15 border-cyan-500/30 text-cyan-300"
                : "bg-slate-800/80 border-slate-600/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {lesson.tip && (
        <div className="px-6 pt-3">
          <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2">
            <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <span>{lesson.tip}</span>
          </div>
        </div>
      )}

      {/* Area de digitacao: texto rolavel (linha unica) + teclado fixo embaixo */}
      <div className="flex-1 min-h-0 flex flex-col" onClick={focus}>
        <div className="flex-1 min-h-0 flex items-center justify-center px-4">
          <div className="relative w-full max-w-4xl">
            <div
              className={`no-scrollbar overflow-x-auto rounded-xl border transition-colors ${
                wrongFlash ? "border-red-500/50 bg-red-950/10" : "border-slate-700/40 bg-slate-900/40"
              }`}
            >
              <div
                className="whitespace-nowrap font-mono text-3xl md:text-4xl tracking-wide py-10"
                style={{ paddingLeft: "50%", paddingRight: "50%" }}
              >
                {target.split("").map((ch, i) => {
                  const done = i < pos;
                  const current = i === pos;
                  const isSpace = ch === " ";
                  return (
                    <span
                      key={i}
                      ref={current ? currentCharRef : null}
                      style={{
                        color: done ? "#34d399" : current ? "#0b1220" : "#64748b",
                        background: current ? (wrongFlash ? "#ef4444" : "#38bdf8") : "transparent",
                        borderRadius: 4,
                        padding: "4px 2px",
                      }}
                    >
                      {isSpace ? "·" : ch}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Campo escondido que captura o teclado (incl. acentos do ABNT2) */}
            <input
              ref={inputRef}
              type="text"
              autoFocus
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onBlur={() => setFocused(false)}
              onFocus={() => setFocused(true)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-default"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />

            {!focused && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/70 backdrop-blur-sm">
                <span className="text-sm text-slate-300">Clique aqui para focar e comecar a digitar</span>
              </div>
            )}
          </div>
        </div>

        {/* Teclado virtual fixo (sempre visivel), rola na horizontal se preciso */}
        <div className="flex-shrink-0 border-t border-slate-700/30 bg-slate-900/30 py-3 px-2 overflow-x-auto no-scrollbar flex justify-center">
          <VirtualKeyboard expectedChar={expectedChar} />
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value, highlight }) => (
  <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl px-5 py-3 min-w-[96px]">
    <div
      className={`text-2xl font-bold ${
        highlight === "emerald" ? "text-emerald-300" : highlight === "amber" ? "text-amber-300" : "text-slate-100"
      }`}
    >
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
  </div>
);

const Live = ({ label, value }) => (
  <div className="text-center">
    <div className="font-bold text-slate-200 tabular-nums">{value}</div>
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
  </div>
);

export default TypingTrainer;
