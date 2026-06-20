import React, { useState } from "react";
import { ArrowLeft, Sparkles, NotebookPen, AlertTriangle, BookOpenText } from "lucide-react";
import { CourseProvider } from "./CourseContext";
import ModuleItem from "./ModuleItem";
import WeeklyDiaryModal from "./WeeklyDiaryModal";
import BulkAIGenerateModal from "./BulkAIGenerateModal";
import ReadingCourseModal from "./ReadingCourseModal";
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
  onMaterialsChanged,
}) => {
  const [showReadingModal, setShowReadingModal] = useState(false);
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
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <button
                  onClick={onBack}
                  title="Voltar para cursos"
                  className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/40 text-slate-200 hover:text-white transition-colors flex-shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
                  <span className="text-xs font-medium">Voltar</span>
                </button>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-100 leading-tight truncate" title={selectedCourse.title}>
                    {selectedCourse.title}
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {completedCount} de {totalLessons} aulas concluidas
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() => setShowReadingModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 rounded-xl transition-all text-sm text-emerald-300 hover:text-emerald-200"
                  title="Gerar um curso de leitura (texto enxuto) a partir das transcricoes deste curso. So no modo local."
                >
                  <BookOpenText className="w-4 h-4" />
                  <span className="hidden sm:inline">Gerar curso leitura</span>
                </button>
                <button
                  onClick={() => setShowBulkAIModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/20 rounded-xl transition-all text-sm text-blue-300 hover:text-blue-200"
                  title="Gerar material com IA para varias aulas de uma vez"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Gerar IA</span>
                </button>
                <button
                  onClick={() => setShowDiaryModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/20 rounded-xl transition-all text-sm text-amber-300 hover:text-amber-200"
                  title="Diario semanal de reflexao"
                >
                  <NotebookPen className="w-4 h-4" />
                  <span className="hidden sm:inline">Diario semanal</span>
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
              <AlertTriangle className="w-5 h-5 text-red-300 flex-shrink-0" />
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
          onMaterialsChanged?.();
        }}
      />
      <ReadingCourseModal
        open={showReadingModal}
        onClose={() => setShowReadingModal(false)}
        courseTitle={selectedCourse.title}
        courseContent={selectedCourse.content}
      />
    </CourseProvider>
  );
};

export default LessonsView;
