// Cliente das rotas do curso de digitacao.
const json = (res) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// Mapa { [lessonId]: { bestWpm, bestAccuracy, attempts, completed, completedAt } }
export const fetchTypingProgress = () =>
  fetch("/api/typing/progress").then(json);

// Registra uma tentativa. Retorna { passed, passAccuracy, lesson }.
export const saveTypingResult = ({ lessonId, wpm, accuracy }) =>
  fetch("/api/typing/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, wpm, accuracy }),
  }).then(json);
