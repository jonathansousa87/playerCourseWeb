import { useState, useEffect, useCallback } from "react";
import { fetchTypingProgress, saveTypingResult } from "../utils/typingApi";
import { TYPING_LESSONS } from "../typing/curriculum";

// Carrega e mantem o progresso do curso de digitacao (por usuario).
// progress: { [lessonId]: { bestWpm, bestAccuracy, attempts, completed, completedAt } }
const useTypingProgress = () => {
  const [progress, setProgress] = useState({});
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await fetchTypingProgress();
      setProgress(data || {});
    } catch (err) {
      console.error("Falha ao carregar progresso de digitacao:", err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Salva o resultado de uma licao e atualiza o estado local com o retorno.
  const saveResult = useCallback(async (lessonId, { wpm, accuracy }) => {
    const res = await saveTypingResult({ lessonId, wpm, accuracy });
    setProgress((prev) => ({ ...prev, [lessonId]: res.lesson }));
    return res;
  }, []);

  const completedCount = TYPING_LESSONS.reduce(
    (n, l) => n + (progress[l.id]?.completed ? 1 : 0),
    0,
  );

  return { progress, ready, reload, saveResult, completedCount };
};

export default useTypingProgress;
