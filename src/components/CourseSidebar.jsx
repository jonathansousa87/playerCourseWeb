import React from "react";
import ModuleItem from "./ModuleItem";
import { useCourse } from "./CourseContext";
import { countLessons, countCompletedLessons } from "../utils/courseUtils";

const CourseSidebar = ({
  sidebarPosition,
  onTogglePosition,
  showPositionToggle = true,
}) => {
  const { selectedCourse, completedLessons, completedSteps } = useCourse();
  const courseProgress = completedLessons[selectedCourse.title] || {};
  const totalLessons = countLessons(selectedCourse.content || []);
  const completedCount = countCompletedLessons(selectedCourse.content || [], courseProgress, completedSteps);
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  return (
    <div className="h-full flex flex-col border-l border-slate-700/50 min-w-[28rem] bg-gradient-to-b from-slate-900 to-slate-900/95">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/40">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white text-base font-semibold flex-1 truncate pr-2">
            {selectedCourse.title}
          </h3>
          {showPositionToggle && onTogglePosition && (
            <button
              onClick={onTogglePosition}
              className="p-1.5 bg-slate-800/60 hover:bg-slate-700/80 rounded-lg transition-colors border border-slate-700/30"
              title={`Mover para ${sidebarPosition === "right" ? "esquerda" : "direita"}`}
              style={{ pointerEvents: "auto" }}
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                {sidebarPosition === "right" ? (
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                ) : (
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                )}
              </svg>
            </button>
          )}
        </div>

        {/* Mini progress */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
            {completedCount}/{totalLessons}
          </span>
        </div>
      </div>

      {/* Lesson list */}
      <div className="flex-1 p-4 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
        <div className="space-y-1">
          {selectedCourse.content.map((item, index) => (
            <ModuleItem key={index} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CourseSidebar;
