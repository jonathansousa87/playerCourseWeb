import { useEffect, useState } from "react";
import { fetchLessonAccuracy } from "../utils/progressApi";

// Retorna um Map<lessonPrefix, { total, correct, accuracy, lastReview }>
// baseado no acerto de flashcards dos ultimos N dias do curso.
const useLessonAccuracy = (courseTitle, days = 30) => {
  const [map, setMap] = useState(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!courseTitle) return;
    setLoading(true);
    fetchLessonAccuracy(courseTitle, days)
      .then((data) => {
        const m = new Map();
        for (const row of data || []) {
          m.set(row.lessonPrefix, row);
        }
        setMap(m);
      })
      .catch((err) => {
        console.error("Erro ao buscar acerto por aula:", err);
        setMap(new Map());
      })
      .finally(() => setLoading(false));
  }, [courseTitle, days]);

  return { map, loading };
};

export default useLessonAccuracy;
