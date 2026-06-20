import React from "react";
import { CheckCircle, ChevronDown, ChevronRight, Circle, AlertTriangle, Clock, Briefcase } from "lucide-react";
import Collapsible from "react-collapsible";
import { useCourse } from "./CourseContext";
import { getFileIcon, formatTime, isVideoFile } from "../utils/fileUtils";
import { calculateModuleDuration } from "../utils/courseUtils";
import InterviewModal from "./InterviewModal";

// Agrega acerto de todas as aulas dentro de um modulo recursivamente.
// Retorna { accuracy, total, hasData } ou null se nenhuma aula teve reviews.
const aggregateModuleAccuracy = (content, accuracyMap) => {
  if (!content || !accuracyMap || accuracyMap.size === 0) return null;
  let totalReviews = 0;
  let totalCorrect = 0;
  const walk = (items) => {
    for (const item of items) {
      if (item.type === "lesson-group" && item.prefix) {
        const row = accuracyMap.get(item.prefix);
        if (row && row.total > 0) {
          totalReviews += row.total;
          totalCorrect += row.correct;
        }
      } else if (item.type === "module" && item.content) {
        walk(item.content);
      }
    }
  };
  walk(content);
  if (totalReviews === 0) return null;
  return {
    accuracy: totalCorrect / totalReviews,
    total: totalReviews,
    hasData: true,
  };
};

// Cor do badge de acerto: vermelho < 60%, amarelo 60-79%, verde >= 80%.
const accuracyBadge = (accuracy) => {
  if (accuracy == null) return null;
  const pct = Math.round(accuracy * 100);
  if (accuracy < 0.6) {
    return { label: `${pct}%`, cls: "bg-red-500/15 text-red-300 border-red-500/30", needsReview: true };
  }
  if (accuracy < 0.8) {
    return { label: `${pct}%`, cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", needsReview: false };
  }
  return { label: `${pct}%`, cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", needsReview: false };
};

const STEP_ICONS = {
  video: "▶",
  resumo: "📄",
  exemplos: "💡",
  quiz: "❓",
  flashcards: "🔁",
  pessoal: "✏️",
};

// Classes do container de uma linha (lição ou lesson-group). Extrair a lógica
// condicional daqui mantém o JSX legível — antes eram ternários aninhados
// inline difíceis de seguir.
const ROW_BASE = "group relative py-3 px-4 transition-all duration-300 cursor-pointer mb-1";

const rowBorderClass = (isInSubModule) =>
  isInSubModule
    ? "border-l-2 border-t border-l-slate-600/30 border-t-slate-600/15"
    : "border-l-2 border-t border-l-transparent border-t-slate-700/15";

const lessonGroupStateClass = ({ isSelected, allDone }) => {
  if (isSelected)
    return "bg-gradient-to-r from-blue-600/25 to-blue-500/25 border-l-blue-400/50 shadow-sm";
  if (allDone)
    return "bg-gradient-to-r from-emerald-900/15 to-emerald-800/15 border-l-emerald-500/30 hover:from-emerald-900/20 hover:to-emerald-800/20";
  return "hover:bg-gradient-to-r hover:from-slate-800/20 hover:to-slate-700/20";
};

const lessonStateClass = ({ isSelected, isCompleted, isInSubModule }) => {
  if (isSelected)
    return "bg-gradient-to-r from-blue-600/25 to-blue-500/25 border-l-blue-400/50 shadow-sm";
  if (isCompleted)
    return isInSubModule
      ? "bg-gradient-to-r from-slate-700/20 to-slate-600/20 border-l-slate-500/40 hover:from-slate-700/25 hover:to-slate-600/25"
      : "bg-gradient-to-r from-slate-800/25 to-slate-700/25 hover:from-slate-800/30 hover:to-slate-700/30";
  return isInSubModule
    ? "hover:bg-gradient-to-r hover:from-slate-700/15 hover:to-slate-600/15 hover:border-l-slate-500/40"
    : "hover:bg-gradient-to-r hover:from-slate-800/20 hover:to-slate-700/20";
};

const LessonGroupItem = ({ item, level }) => {
  const {
    selectedLesson,
    completedSteps,
    videoDurations,
    onSelectLesson,
  } = useCourse();

  const isSelected = selectedLesson && selectedLesson.path === item.path;
  const materials = item.materials || {};
  const stepKeys = [...Object.keys(materials), "pessoal"];
  const completedCount = stepKeys.filter(
    (k) => completedSteps?.[`${item.prefix}__${k}`]
  ).length;
  const allDone = stepKeys.length > 0 && completedCount === stepKeys.length;
  const isInSubModule = level > 0;

  // Get video duration if available
  const videoPath = materials.video?.path;
  const videoDuration = videoPath ? videoDurations[videoPath] : null;

  return (
    <div
      className={`${ROW_BASE} ${rowBorderClass(isInSubModule)} ${lessonGroupStateClass({ isSelected, allDone })}`}
      onClick={() => onSelectLesson(item)}
    >
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div
          className={`flex items-center justify-center w-6 h-6 mt-1 flex-shrink-0 ${
            allDone
              ? "bg-emerald-500/20 text-emerald-400"
              : isSelected
              ? "bg-blue-500/25 text-blue-300"
              : "bg-slate-700/40 text-slate-400 group-hover:bg-slate-600/50"
          }`}
        >
          {allDone ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <Circle className="w-3 h-3" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h4
              className={`font-medium text-sm leading-relaxed transition-all duration-300 ${
                allDone
                  ? "text-emerald-200"
                  : isSelected
                  ? "text-white font-semibold"
                  : "text-gray-200 group-hover:text-white"
              }`}
              style={{ wordBreak: "break-word", whiteSpace: "normal", lineHeight: "1.4" }}
            >
              {item.title}
            </h4>

            {videoDuration && videoDuration > 0 && (
              <div
                className={`flex items-center px-2 py-1 text-xs mt-0.5 flex-shrink-0 ${
                  isSelected
                    ? "bg-blue-500/25 text-blue-200"
                    : "bg-slate-800/40 text-slate-300 group-hover:bg-slate-700/50"
                }`}
              >
                <Clock className="w-3 h-3 mr-1" />
                {formatTime(videoDuration)}
              </div>
            )}
          </div>

          {/* Step progress bar */}
          <div className="flex items-center gap-1.5 mt-2">
            {stepKeys.map((key) => {
              const isDone = completedSteps?.[`${item.prefix}__${key}`];
              return (
                <div
                  key={key}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                    isDone
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-slate-700/30 text-slate-500"
                  }`}
                  title={key}
                >
                  <span className="text-[10px]">{STEP_ICONS[key] || "•"}</span>
                </div>
              );
            })}
            <span className="text-xs text-slate-500 ml-1">
              {completedCount}/{stepKeys.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModuleItem = ({ item, level = 0 }) => {
  const {
    selectedCourse,
    selectedLesson,
    completedLessons,
    expandedModules,
    toggleModuleExpansion,
    videoDurations,
    loadingVideos,
    onSelectLesson,
    onToggleLessonComplete,
    lessonAccuracy,
  } = useCourse();

  const [interviewOpen, setInterviewOpen] = React.useState(false);

  // Render lesson-group with its own component
  if (item.type === "lesson-group") {
    return <LessonGroupItem item={item} level={level} />;
  }

  const courseTitle = selectedCourse.title;
  const isModule = item.type === "module";
  const isExpanded = isModule && (expandedModules[item.path] || false);
  const isSelected = selectedLesson && selectedLesson.path === item.path;
  const isVideo = !isModule && item.title && isVideoFile(item.title);

  const moduleData = isModule
    ? calculateModuleDuration(item.content, videoDurations)
    : { duration: 0, videoCount: 0 };

  const moduleAccuracy = isModule
    ? aggregateModuleAccuracy(item.content, lessonAccuracy)
    : null;
  const badge = moduleAccuracy ? accuracyBadge(moduleAccuracy.accuracy) : null;

  const isCompleted = isModule
    ? item.content &&
      item.content.every((subItem) => {
        if (subItem.type === "lesson") {
          return completedLessons[courseTitle]?.[subItem.path] || false;
        }
        return false;
      })
    : completedLessons[courseTitle]?.[item.path] || false;

  if (isModule) {
    const isSubModule = level > 0;
    const triggerElement = (
      <div
        className={`group relative flex items-center w-full px-4 py-4 transition-all duration-300 cursor-pointer ${
          isSubModule
            ? "border-l-2 border-t border-l-slate-600/40 border-t-slate-600/20"
            : "border-l-2 border-t border-l-transparent border-t-slate-700/20"
        } ${
          isCompleted
            ? "bg-gradient-to-r from-emerald-500/15 to-emerald-400/15 shadow-sm"
            : isExpanded
            ? isSubModule
              ? "bg-gradient-to-r from-slate-700/30 to-slate-600/30 border-l-slate-500/60 shadow-sm"
              : "bg-gradient-to-r from-slate-800/40 to-slate-700/40 shadow-sm"
            : isSubModule
            ? "hover:bg-gradient-to-r hover:from-slate-700/20 hover:to-slate-600/20 hover:border-l-slate-500/50"
            : "hover:bg-gradient-to-r hover:from-slate-800/30 hover:to-slate-700/30"
        }`}
      >
        <div
          className={`flex items-center justify-center w-8 h-8 transition-all duration-300 mr-4 ${
            isExpanded
              ? isSubModule
                ? "bg-slate-500/25 text-slate-300"
                : "bg-slate-600/30 text-slate-200"
              : "bg-slate-700/40 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300"
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 transition-transform duration-300" />
          ) : (
            <ChevronRight className="w-4 h-4 transition-transform duration-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={`font-semibold text-base transition-colors duration-300 leading-tight flex-1 ${
                isCompleted
                  ? "text-emerald-100"
                  : isExpanded
                  ? "text-white"
                  : "text-gray-200 group-hover:text-white"
              }`}
              style={{ wordBreak: "break-word", whiteSpace: "normal" }}
            >
              {item.title}
            </h3>
            {badge && (
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls} flex-shrink-0`}
                title={`Acerto médio (últimos 30 dias): ${badge.label} em ${moduleAccuracy.total} reviews`}
              >
                {badge.needsReview && <AlertTriangle className="w-2.5 h-2.5" />}
                {badge.label}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setInterviewOpen(true);
              }}
              title="Simular uma entrevista de emprego sobre este módulo"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 flex-shrink-0"
            >
              <Briefcase className="w-3 h-3" />
              Entrevista
            </button>
          </div>
          <p
            className={`text-xs mt-1 transition-colors duration-300 ${
              isCompleted ? "text-emerald-300" : "text-gray-400"
            }`}
          >
            {item.content?.length || 0}{" "}
            {item.content?.length === 1 ? "item" : "itens"}
            {moduleData.duration > 0 && moduleData.videoCount > 0 && (
              <span className="ml-2">
                • {formatTime(moduleData.duration)} ({moduleData.videoCount}{" "}
                vídeo{moduleData.videoCount !== 1 ? "s" : ""})
              </span>
            )}
            {isCompleted && " ✓ Completo"}
            {badge?.needsReview && (
              <span className="ml-2 text-red-400">• precisa revisar</span>
            )}
          </p>
        </div>
      </div>
    );

    return (
      <div className="mb-2">
        <Collapsible
          trigger={triggerElement}
          open={isExpanded}
          onTriggerOpening={() =>
            !isExpanded && toggleModuleExpansion(item.path)
          }
          onTriggerClosing={() =>
            isExpanded && toggleModuleExpansion(item.path)
          }
          transitionTime={300}
          easing="ease-in-out"
        >
          {item.content && (
            <div className="mt-2 space-y-1">
              {item.content.map((child, idx) => (
                <ModuleItem key={idx} item={child} level={level + 1} />
              ))}
            </div>
          )}
        </Collapsible>
        {interviewOpen && (
          <InterviewModal
            open={interviewOpen}
            onClose={() => setInterviewOpen(false)}
            courseTitle={courseTitle}
            modulePath={item.path}
            moduleTitle={item.title}
          />
        )}
      </div>
    );
  }

  // Renderizar uma lição (arquivo)
  const isInSubModule = level > 0;
  return (
    <div
      className={`${ROW_BASE} ${rowBorderClass(isInSubModule)} ${lessonStateClass({ isSelected, isCompleted, isInSubModule })}`}
      onClick={() => onSelectLesson(item)}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex items-center justify-center w-6 h-6 mt-1 transition-all duration-300 flex-shrink-0 cursor-pointer ${
            isCompleted
              ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300"
              : isSelected
              ? "bg-blue-500/25 text-blue-300 hover:bg-blue-500/35 hover:text-blue-200"
              : "bg-slate-700/40 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300 hover:bg-slate-600/60 hover:text-slate-200"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLessonComplete(item);
          }}
          title={isCompleted ? "Marcar como pendente" : "Marcar como concluída"}
        >
          {isCompleted ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <Circle className="w-3 h-3" />
          )}
        </div>

        <div
          className={`flex items-center justify-center w-6 h-6 mt-1 transition-all duration-300 flex-shrink-0 ${
            isVideo
              ? isSelected
                ? "bg-red-500/20 text-red-300"
                : isInSubModule
                ? "bg-red-500/12 text-red-400 group-hover:bg-red-500/18"
                : "bg-red-500/15 text-red-400 group-hover:bg-red-500/25"
              : isSelected
              ? "bg-violet-500/20 text-violet-300"
              : isInSubModule
              ? "bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/15"
              : "bg-violet-500/15 text-violet-400 group-hover:bg-violet-500/25"
          }`}
        >
          <div className="scale-75">{getFileIcon(item.title)}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4
                className={`font-medium text-sm leading-relaxed transition-all duration-300 ${
                  isCompleted
                    ? "text-gray-400 line-through group-hover:text-gray-300"
                    : isSelected
                    ? "text-white font-semibold"
                    : "text-gray-200 group-hover:text-white"
                }`}
                title={item.title}
                style={{
                  wordBreak: "break-word",
                  whiteSpace: "normal",
                  lineHeight: "1.4",
                }}
              >
                {item.title}
              </h4>
            </div>

            {isVideo && (
              <div
                className={`flex items-center px-2 py-1 text-xs transition-all duration-300 mt-0.5 flex-shrink-0 ${
                  isCompleted
                    ? "bg-slate-600/25 text-slate-400"
                    : isSelected
                    ? "bg-blue-500/25 text-blue-200 font-medium"
                    : isInSubModule
                    ? "bg-slate-700/30 text-slate-400 group-hover:bg-slate-600/40"
                    : "bg-slate-800/40 text-slate-300 group-hover:bg-slate-700/50"
                }`}
              >
                <Clock className="w-3 h-3 mr-1" />
                {videoDurations[item.path]
                  ? formatTime(videoDurations[item.path])
                  : loadingVideos.has(item.path)
                  ? "..."
                  : "--:--"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleItem;
