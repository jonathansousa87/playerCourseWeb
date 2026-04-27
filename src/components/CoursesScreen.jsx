import React from "react";
import { Settings } from "lucide-react";
import CourseCard from "./CourseCard";
import ConfigModal from "./ConfigModal";
import { countLessons, countCompletedLessons } from "../utils/courseUtils";

// Tela inicial: header com stats + grid de cursos + modal de config.
const CoursesScreen = ({
  courses,
  completedLessons,
  completedSteps,
  coursesPath,
  setCoursesPath,
  saveCoursesPath,
  showConfigModal,
  setShowConfigModal,
  onSelectCourse,
  onView,
}) => {
  const totalAllLessons = courses.reduce(
    (sum, c) => sum + countLessons(c.content || []),
    0,
  );
  const totalAllCompleted = courses.reduce((sum, c) => {
    const progress = completedLessons[c.title] || {};
    const steps = completedSteps[c.title] || {};
    return sum + countCompletedLessons(c.content || [], progress, steps);
  }, 0);

  const overallPct =
    totalAllLessons > 0
      ? Math.round((totalAllCompleted / totalAllLessons) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60">
        <div className="w-full px-6 lg:px-10 xl:px-14 py-5 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Meus Cursos</h1>
              <p className="text-sm text-slate-400">Plataforma de estudo com fixacao</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {totalAllLessons > 0 && (
              <div className="hidden md:flex items-center gap-6 mr-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-200">{totalAllCompleted}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Concluidas</div>
                </div>
                <div className="w-px h-8 bg-slate-700/60" />
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-200">{courses.length}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Cursos</div>
                </div>
                <div className="w-px h-8 bg-slate-700/60" />
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-400">{overallPct}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Progresso</div>
                </div>
              </div>
            )}
            <button
              onClick={() => onView("dashboard")}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 rounded-xl transition-all text-sm text-emerald-300 hover:text-emerald-200"
              title="Dashboard de estudo"
            >
              <span>📊</span>
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => onView("review")}
              className="flex items-center gap-2 px-3.5 py-2 bg-cyan-600/15 hover:bg-cyan-600/25 border border-cyan-500/20 rounded-xl transition-all text-sm text-cyan-300 hover:text-cyan-200"
              title="Revisar flashcards de todos os cursos"
            >
              <span>🔁</span>
              <span className="hidden sm:inline">Revisar</span>
            </button>
            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl transition-all text-sm text-slate-300 hover:text-white"
              title="Configuracoes"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Config</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-10 xl:px-14 py-8">
        {totalAllLessons > 0 && (
          <div className="mb-8 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Progresso geral</span>
              <span className="text-sm font-medium text-slate-300">
                {totalAllCompleted} de {totalAllLessons} aulas
              </span>
            </div>
            <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {courses.map((course, index) => {
            const courseProgress = completedLessons[course.title] || {};
            const courseSteps = completedSteps[course.title] || {};
            const total = countLessons(course.content || []);
            const completed = countCompletedLessons(
              course.content || [],
              courseProgress,
              courseSteps,
            );
            return (
              <div
                key={index}
                onClick={() => onSelectCourse(course)}
                className="cursor-pointer"
              >
                <CourseCard
                  title={course.title}
                  description={course.description}
                  totalLessons={total}
                  completedCount={completed}
                  index={index}
                />
              </div>
            );
          })}
        </div>
      </main>

      {showConfigModal && (
        <ConfigModal
          coursesPath={coursesPath}
          onPathChange={setCoursesPath}
          onSave={saveCoursesPath}
          onCancel={() => {
            setShowConfigModal(false);
            setCoursesPath("/mnt/nvme2/kadabra/Downloads/cursos/");
          }}
        />
      )}
    </div>
  );
};

export default CoursesScreen;
