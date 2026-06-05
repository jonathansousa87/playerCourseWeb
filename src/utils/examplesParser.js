// Extrai os cards dos arquivos *_exemplos_*.html (legado).
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

// Extrai os cards dos arquivos *_exemplos_*.md (novo padrao).
// Cada secao ## vira um card; o conteudo e Markdown puro (renderizado pelo viewer).
export const parseExemplosMd = (md) => {
  const blocks = md
    .split(/(?=^## )/m)
    .map((b) => b.trim())
    .filter((b) => /^## /.test(b));

  return blocks.map((block, idx) => {
    const newlineIdx = block.indexOf("\n");
    const headingLine = newlineIdx === -1 ? block : block.slice(0, newlineIdx);
    const title = headingLine.replace(/^##\s+/, "").replace(/^\d+\.\s*/, "").trim();
    const content = newlineIdx === -1 ? "" : block.slice(newlineIdx + 1).trim();
    return { id: idx + 1, title, content };
  }).filter((c) => c.title);
};
