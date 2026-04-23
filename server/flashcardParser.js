// Parser puro dos arquivos .txt de flashcards Anki.
// Sem efeitos colaterais ou dependencias externas — facil de testar.
// Suporta 4 formatos (em ordem de tentativa):
//   1. Tab-separated canonico: "pergunta<TAB>resposta"
//   2. <b> inline parcial: "pergunta <b>resposta</b> texto extra"
//   3. Multi-espacos (4+): "pergunta    resposta"  (fallback quando IA gera espacos em vez de tab)
//   4. "Pergunta: resposta" (fallback quando IA usa dois-pontos)

const stripHtml = (html) => html.replace(/<[^>]*>/g, '').trim();

export const parseAnkiFlashcards = (text) => {
  const lines = text.split('\n').filter((l) => l.trim());
  const cards = [];
  for (const line of lines) {
    if (line.startsWith('#')) continue;

    const tabParts = line.split('\t');
    if (tabParts.length >= 2) {
      cards.push({
        front: stripHtml(tabParts[0].trim()),
        back: stripHtml(tabParts[1].trim()),
      });
      continue;
    }

    const partialBoldMatch = line.match(/^(.+?)<b>(.+?)<\/b>(.*)$/i);
    if (partialBoldMatch) {
      const front = stripHtml(partialBoldMatch[1].trim());
      const back = stripHtml((partialBoldMatch[2] + partialBoldMatch[3]).trim());
      if (front && back) {
        cards.push({ front, back });
        continue;
      }
    }

    const multiSpaceMatch = line.match(/^(.+?)\s{4,}(.+)$/);
    if (multiSpaceMatch) {
      const front = stripHtml(multiSpaceMatch[1].trim());
      const back = stripHtml(multiSpaceMatch[2].trim());
      if (front && back) {
        cards.push({ front, back });
        continue;
      }
    }

    const colonMatch = line.match(/^([^.!?]{5,}?)\s*[:：]\s*(.+)$/);
    if (colonMatch) {
      const front = stripHtml(colonMatch[1].trim());
      const back = stripHtml(colonMatch[2].trim());
      if (front.length > 4 && back.length > 2) {
        cards.push({ front: front.endsWith('?') ? front : front + '?', back });
        continue;
      }
    }
  }
  return cards;
};
