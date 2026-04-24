// Extrai questoes dos *_quiz_*.html.
// Formato esperado: div.question-card > h3.question-title + buttons.answer-btn[data-correct] + div.explanation
export const parseQuizHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cards = doc.querySelectorAll(".question-card");
  const questions = [];
  cards.forEach((card, idx) => {
    const titleEl = card.querySelector(".question-title");
    const buttons = card.querySelectorAll(".answer-btn");
    const explEl = card.querySelector(".explanation");
    if (!titleEl || buttons.length === 0) return;
    const title = titleEl.textContent.replace(/^\s*\d+\.\s*/, "").trim();
    const options = Array.from(buttons).map((btn) => ({
      text: btn.textContent.trim(),
      correct: btn.getAttribute("data-correct") === "true",
    }));
    questions.push({
      id: idx + 1,
      question: title,
      options,
      explanation: explEl ? explEl.textContent.trim() : "",
    });
  });
  return questions;
};
