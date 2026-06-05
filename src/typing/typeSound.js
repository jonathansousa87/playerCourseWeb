// Som de digitacao sintetizado via Web Audio API — sem arquivos de audio.
// Clique curto e suave no acerto; som mais grave/abafado no erro. O contexto
// e' criado sob demanda (precisa de um gesto do usuario para iniciar no
// navegador) e reaproveitado entre as teclas.

let ctx = null;

const getCtx = () => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
};

// Toca um "tique" curto. freq mais alta = clique de acerto; baixa = erro.
const blip = (freq, duration, gainPeak, type = "square") => {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  // Envelope rapido (ataque quase instantaneo, decay curto) — som de "click".
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);
};

export const playKeyClick = () => blip(660, 0.05, 0.08, "square");
export const playKeyError = () => blip(160, 0.12, 0.12, "sawtooth");
