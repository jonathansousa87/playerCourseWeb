// Reordenacao de sessao de revisao (Brunmair & Richter 2019, interleaving).
// Estudar A-A-A-B-B-B eh pior pra retencao que A-B-A-B-A-B em topicos
// similares. Os FSRS due_dates por padrao agrupam por curso (cards do
// mesmo curso costumam ter due proximos), entao forcamos alternancia.
//
// Tudo aqui eh funcao pura — facil de testar, sem dependencia de DOM/DB.

// Round-robin entre buckets (cursos). Mantem ordem original dentro de cada bucket.
//
// Ex: [{c:1}, {c:1}, {c:1}, {c:2}, {c:2}, {c:3}]
//  -> [{c:1}, {c:2}, {c:3}, {c:1}, {c:2}, {c:1}]
export const interleaveByCourse = (cards) => {
  if (!Array.isArray(cards) || cards.length === 0) return [];

  // Agrupa preservando ordem. Map() preserva insertion order — primeiro
  // curso visto na lista vira primeiro no round-robin.
  const buckets = new Map();
  for (const card of cards) {
    const key = card.course_title || card.courseTitle || "__no_course__";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(card);
  }

  // Se ha apenas 1 curso, interleaving nao faz sentido — retorna como veio.
  if (buckets.size <= 1) return [...cards];

  // Round-robin: pega 1 de cada bucket por vez. Buckets vazios sao pulados.
  const result = [];
  const bucketArrays = [...buckets.values()];
  let added = true;
  while (added) {
    added = false;
    for (const bucket of bucketArrays) {
      if (bucket.length > 0) {
        result.push(bucket.shift());
        added = true;
      }
    }
  }
  return result;
};

// Move cards que pertencem a um grupo de "confusao semantica" (Brunmair:
// similarity matters — interleaving SIMILAR consolida mais) pro inicio
// da sessao, mantendo eles tambem em round-robin entre cursos.
//
// confusionCardIds: Set<number> com IDs dos cards em algum grupo confuso.
export const prioritizeConfusion = (cards, confusionCardIds) => {
  if (!confusionCardIds || confusionCardIds.size === 0) return cards;

  const confused = [];
  const rest = [];
  for (const card of cards) {
    if (confusionCardIds.has(card.id)) confused.push(card);
    else rest.push(card);
  }
  // Aplica interleaving em cada subgrupo separadamente
  return [...interleaveByCourse(confused), ...interleaveByCourse(rest)];
};

// Pipeline completo: dado o array bruto do endpoint /api/flashcards/due
// + lista de IDs em grupos confusos, retorna a ordem final da sessao.
export const buildSessionQueue = (cards, confusionCardIds = new Set()) => {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  if (confusionCardIds.size > 0) {
    return prioritizeConfusion(cards, confusionCardIds);
  }
  return interleaveByCourse(cards);
};
