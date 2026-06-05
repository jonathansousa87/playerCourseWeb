import React from "react";
import { KEYBOARD_ROWS, FINGERS, charToSteps } from "../../typing/keyboardLayout";

// Teclado ABNT2 na tela. Cada tecla recebe a cor do dedo que a digita; a
// proxima tecla esperada fica realcada (preenchida). Para acentos, realca a
// tecla morta e a letra; para maiusculas/simbolos, realca o Shift oposto.
const UNIT = 34; // largura base de uma tecla (px)

const VirtualKeyboard = ({ expectedChar }) => {
  const { steps } = charToSteps(expectedChar);

  // Mapa label -> { color, primary } para teclas de caractere.
  const active = new Map();
  let shiftSide = null;
  let spaceActive = false;
  steps.forEach((s, i) => {
    if (s.label === "Espaco") {
      spaceActive = true;
    } else if (s.label) {
      active.set(s.label, { color: FINGERS[s.finger]?.color, primary: i === 0 });
    }
    if (s.shift) shiftSide = s.finger?.startsWith("L") ? "right" : "left";
  });

  const isActive = (key) => {
    if (key.label === "Shift") {
      return (shiftSide === "left" && key.side !== "right") || (shiftSide === "right" && key.side === "right");
    }
    if (key.label === "Espaco") return spaceActive;
    return active.has(key.label);
  };

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      {KEYBOARD_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((key, ki) => {
            const fingerColor = FINGERS[key.finger]?.color || "#64748b";
            const act = isActive(key);
            const isPrimary = active.get(key.label)?.primary || (spaceActive && key.label === "Espaco");
            const width = (key.w || 1) * UNIT;
            return (
              <div
                key={ki}
                style={{
                  width,
                  height: UNIT,
                  borderColor: act ? fingerColor : "var(--border, #334155)",
                  background: act ? fingerColor : "var(--surface-2, #1e293b)",
                  color: act ? "#0b1220" : fingerColor,
                  boxShadow: act && isPrimary ? `0 0 0 2px ${fingerColor}, 0 0 12px ${fingerColor}` : "none",
                  fontWeight: act ? 700 : 500,
                }}
                className="relative flex items-center justify-center rounded-md border text-[11px] transition-all duration-100"
                title={FINGERS[key.finger]?.name}
              >
                {key.label}
                {key.home && (
                  <span
                    className="absolute bottom-1 w-3 h-0.5 rounded-full"
                    style={{ background: act ? "#0b1220" : fingerColor }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default VirtualKeyboard;
