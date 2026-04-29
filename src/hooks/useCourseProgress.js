import { useState, useEffect, useCallback } from "react";
import { findNextLesson } from "../utils/courseUtils";
import {
  fetchAllProgress,
  markLessonComplete,
  unmarkLessonComplete,
  markStepComplete as apiMarkStep,
  unmarkStepComplete as apiUnmarkStep,
} from "../utils/progressApi";

// completedLessons: { [courseTitle]: { [lessonPath]: true } }
// completedSteps:   { [courseTitle]: { [lessonPrefix__stepKey]: true } }
const useCourseProgress = () => {
  const [completedLessons, setCompletedLessons] = useState({});
  const [completedSteps, setCompletedSteps] = useState({});
  const [ready, setReady] = useState(false);

  const loadSnapshot = useCallback(async () => {
    try {
      const snap = await fetchAllProgress();
      const lessons = {};
      const steps = {};
      for (const [courseTitle, data] of Object.entries(snap)) {
        lessons[courseTitle] = data.lessons || {};
        steps[courseTitle] = data.steps || {};
      }
      setCompletedLessons(lessons);
      setCompletedSteps(steps);
    } catch (err) {
      console.error("Falha ao carregar progresso:", err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const toggleLessonComplete = useCallback(
    async (lesson, courseTitle, courseContent, onSelectLesson) => {
      const wasCompleted = completedLessons[courseTitle]?.[lesson.path];

      // Atualizacao otimista
      setCompletedLessons((prev) => ({
        ...prev,
        [courseTitle]: {
          ...(prev[courseTitle] || {}),
          [lesson.path]: !wasCompleted,
        },
      }));

      try {
        if (wasCompleted) {
          await unmarkLessonComplete(courseTitle, lesson.path);
        } else {
          await markLessonComplete(courseTitle, lesson.path);
        }
      } catch (err) {
        console.error("Erro ao sincronizar lesson progress:", err);
        // Reverte em caso de erro
        setCompletedLessons((prev) => ({
          ...prev,
          [courseTitle]: {
            ...(prev[courseTitle] || {}),
            [lesson.path]: wasCompleted,
          },
        }));
        return;
      }

      if (!wasCompleted && onSelectLesson) {
        const nextLesson = findNextLesson(courseContent, lesson.path);
        if (nextLesson) {
          setTimeout(() => {
            onSelectLesson(nextLesson);
          }, 300);
        }
      }
    },
    [completedLessons],
  );

  const toggleStepComplete = useCallback(
    async (courseTitle, fullStepKey) => {
      const wasCompleted = !!completedSteps[courseTitle]?.[fullStepKey];

      setCompletedSteps((prev) => ({
        ...prev,
        [courseTitle]: {
          ...(prev[courseTitle] || {}),
          [fullStepKey]: !wasCompleted,
        },
      }));

      try {
        if (wasCompleted) {
          await apiUnmarkStep(courseTitle, fullStepKey);
        } else {
          await apiMarkStep(courseTitle, fullStepKey);
        }
      } catch (err) {
        console.error("Erro ao sincronizar step progress:", err);
        setCompletedSteps((prev) => ({
          ...prev,
          [courseTitle]: {
            ...(prev[courseTitle] || {}),
            [fullStepKey]: wasCompleted,
          },
        }));
      }
    },
    [completedSteps],
  );

  return {
    completedLessons,
    completedSteps,
    toggleLessonComplete,
    toggleStepComplete,
    ready,
    reload: loadSnapshot,
  };
};

export default useCourseProgress;
