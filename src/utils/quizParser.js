// Extrai questoes dos *_quiz_*.html (legado).
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

// Extrai questoes dos *_quiz_*.md (novo padrao).
// Formato esperado por bloco:
//   ## N. Pergunta?
//   - [ ] Alternativa
//   - [x] Alternativa correta
//   > Explicacao
export const parseQuizMd = (md) => {
  // Divide pelo inicio de cada cabecalho ## N.
  const blocks = md
    .split(/(?=^## \d+\.)/m)
    .map((b) => b.trim())
    .filter((b) => /^## \d+\./.test(b));

  return blocks.map((block, idx) => {
    const lines = block.split("\n").map((l) => l.trimEnd());

    const headingLine = lines.find((l) => /^## /.test(l)) || "";
    const question = headingLine.replace(/^##\s+\d+\.\s*/, "").trim();

    const options = lines
      .filter((l) => /^-\s+\[[ xX]\]/.test(l))
      .map((l) => ({
        text: l.replace(/^-\s+\[[ xX]\]\s*/, "").trim(),
        correct: /^-\s+\[[xX]\]/.test(l),
      }));

    const explLines = lines.filter((l) => /^>/.test(l));
    const explanation = explLines
      .map((l) => l.replace(/^>\s*/, "").trim())
      .join(" ");

    if (!question || options.length === 0) return null;
    return { id: idx + 1, question, options, explanation };
  }).filter(Boolean);
};

// Auto-detecta o formato pelo conteudo e retorna a lista de questoes.
export const parseQuiz = (content) => {
  const looksLikeHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(content);
  return looksLikeHtml ? parseQuizHtml(content) : parseQuizMd(content);
};
