// Extrai os cards dos arquivos *_exemplos_*.html.
// Cada card eh um div.card com conteudo: h2 (titulo), p e pre/code (conteudo).
export const parseExemplosHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cards = doc.querySelectorAll(".card");
  const items = [];
  cards.forEach((card, idx) => {
    const titleEl = card.querySelector("h1, h2") || {
      textContent: idx === 0 ? "Conceito principal" : `Conceito ${idx}`,
    };
    const contentHtml = card.innerHTML
      .replace(/<h[12][^>]*>.*?<\/h[12]>/i, "")
      .trim();
    items.push({
      id: idx + 1,
      title: titleEl.textContent.trim(),
      content: contentHtml,
    });
  });
  return items;
};
