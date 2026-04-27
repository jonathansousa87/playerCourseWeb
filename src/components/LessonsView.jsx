import React from "react";
import { CourseProvider } from "./CourseContext";
import ModuleItem from "./ModuleItem";
import WeeklyDiaryModal from "./WeeklyDiaryModal";
import BulkAIGenerateModal from "./BulkAIGenerateModal";
import {
  countLessons,
  countCompletedLessons,
  countWeakModules,
} from "../utils/courseUtils";

// Tela de listagem de aulas de um curso (header + progress + banner de
// revisao quando modulos estao fracos + lista de modulos).
const LessonsView = ({
  selectedCourse,
  completedLessons,
  currentCourseSteps,
  lessonAccuracy,
  onBack,
  onView,
  showDiaryModal,
  setShowDiaryModal,
  showBulkAIModal,
  setShowBulkAIModal,
  courseContextValue,
}) => {
  const courseProgress = completedLessons[selectedCourse.title] || {};
  const totalLessons = countLessons(selectedCourse.content);
  const completedCount = countCompletedLessons(
    selectedCourse.content,
    courseProgress,
    currentCourseSteps,
  );
  const progressPercent =
    totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const weakModules = countWeakModules(selectedCourse.content, lessonAccuracy);

  return (
    <CourseProvider value={courseContextValue}>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
        <div className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="w-full px-6 lg:px-10 xl:px-14 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={onBack}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                  title="Voltar para cursos"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h2 className="text-lg font-bold text-slate-100 leading-tight">
                    {selectedCourse.title}
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {completedCount} de {totalLessons} aulas concluidas
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowBulkAIModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/20 rounded-xl transition-all text-sm text-blue-300 hover:text-blue-200"
                  title="Gerar material com IA para varias aulas de uma vez"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="hidden sm:inline">Gerar IA</span>
                </button>
                <button
                  onClick={() => setShowDiaryModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/20 rounded-xl transition-all text-sm text-amber-300 hover:text-amber-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="hidden sm:inline">Diario</span>
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-400 tabular-nums w-10 text-right">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>

        <div className="w-full px-6 lg:px-10 xl:px-14 py-6">
          {weakModules > 0 && (
            <div className="mb-5 flex items-center gap-3 bg-red-950/25 border border-red-500/25 rounded-xl px-4 py-3">
              <span className="text-red-300 text-lg">⚠</span>
              <div className="flex-1 text-sm">
                <div className="text-red-100 font-medium">
                  {weakModules} módulo{weakModules > 1 ? "s" : ""} com acerto abaixo de 60%
                </div>
                <div className="text-red-300/80 text-xs mt-0.5">
                  Recomendo revisar antes de seguir adiante. FSRS vai repriorizar cards fracos.
                </div>
              </div>
              <button
                onClick={() => onView("review")}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-xs text-red-200 font-medium transition-colors"
              >
                Revisar agora
              </button>
            </div>
          )}
          <div className="space-y-1.5">
            {selectedCourse.content.map((item, index) => (
              <ModuleItem key={index} item={item} />
            ))}
          </div>
        </div>
      </div>
      {showDiaryModal && (
        <WeeklyDiaryModal
          courseTitle={selectedCourse.title}
          onClose={() => setShowDiaryModal(false)}
        />
      )}
      <BulkAIGenerateModal
        open={showBulkAIModal}
        onClose={() => setShowBulkAIModal(false)}
        courseTitle={selectedCourse.title}
        courseContent={selectedCourse.content}
        onGenerated={() => {
          setTimeout(() => window.location.reload(), 800);
        }}
      />
    </CourseProvider>
  );
};

export default LessonsView;
