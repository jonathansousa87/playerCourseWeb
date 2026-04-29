import React from "react";
import { CourseProvider } from "./CourseContext";
import ModuleItem from "./ModuleItem";
import { ArrowLeft, CheckCircle, Circle } from "lucide-react";
import LessonStepper from "./LessonStepper";
import VideoPlayer from "./VideoPlayer";
import HTMLViewer from "./HTMLViewer";
import PDFViewer from "./PDFViewer";
import UnsupportedViewer from "./UnsupportedViewer";
import CourseSidebar from "./CourseSidebar";
import PomodoroTimer from "./PomodoroTimer";
import ChatFAB from "./ChatFAB";
import { findNextLesson } from "../utils/courseUtils";
import { isVideoFile, isPDFFile, isHTMLFile } from "../utils/fileUtils";

// Decide o modo de player: lesson-group (stepper moderno), HTML/PDF,
// video legacy (arquivo solto) ou unsupported.
const LessonPlayer = ({
  selectedCourse,
  selectedLesson,
  completedLessons,
  currentCourseSteps,
  courseContextValue,
  videoPlayer,
  fullscreen,
  sidebar,
  handleBack,
  handleStepComplete,
  handleToggleLessonComplete,
  handleLessonSelect,
  toggleLessonComplete,
  buildVideoProps,
}) => {
  const isLessonGroup = selectedLesson.type === "lesson-group";

  if (isLessonGroup) {
    return (
      <LessonGroupPlayer
        selectedCourse={selectedCourse}
        selectedLesson={selectedLesson}
        currentCourseSteps={currentCourseSteps}
        courseContextValue={courseContextValue}
        videoPlayer={videoPlayer}
        fullscreen={fullscreen}
        sidebar={sidebar}
        handleStepComplete={handleStepComplete}
        handleBack={handleBack}
        onLessonComplete={(lesson) => {
          if (!completedLessons[selectedCourse.title]?.[lesson.path]) {
            toggleLessonComplete(
              lesson,
              selectedCourse.title,
              selectedCourse.content,
              handleLessonSelect,
            );
          }
        }}
        buildVideoProps={buildVideoProps}
      />
    );
  }

  // Legacy: aula solta (arquivo unico)
  const isVideo = isVideoFile(selectedLesson.title);
  const isPDF = isPDFFile(selectedLesson.title);
  const isHTML = isHTMLFile(selectedLesson.title);
  const fileUrl = `http://localhost:3001/cursos/${selectedCourse.title}/${selectedLesson.path}`;
  const isCompleted =
    completedLessons[selectedCourse.title]?.[selectedLesson.path] || false;

  if (isHTML || isPDF) {
    return (
      <CourseProvider value={courseContextValue}>
        <div className="h-screen bg-slate-950 text-slate-100 flex">
          <div className="flex-1 bg-slate-900">
            {isHTML ? (
              <HTMLViewer
                selectedLesson={selectedLesson}
                selectedCourse={selectedCourse}
                isCompleted={isCompleted}
                onToggleComplete={() => handleToggleLessonComplete(selectedLesson)}
                onBack={handleBack}
              />
            ) : (
              <PDFViewer
                selectedLesson={selectedLesson}
                fileUrl={fileUrl}
                isCompleted={isCompleted}
                onToggleComplete={() => handleToggleLessonComplete(selectedLesson)}
                onBack={handleBack}
              />
            )}
          </div>
          <div className="w-[28rem] bg-slate-900 border-l border-slate-700/50 flex flex-col">
            <div className="p-4 border-b border-slate-700/40">
              <h3 className="text-slate-100 text-base font-semibold text-center">
                {selectedCourse.title}
              </h3>
              <div className="text-slate-500 text-xs text-center mt-1.5">
                Lista de Aulas
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
              <div className="space-y-1">
                {selectedCourse.content.map((item, index) => (
                  <ModuleItem key={index} item={item} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </CourseProvider>
    );
  }

  if (isVideo) {
    return (
      <LegacyVideoPlayer
        selectedCourse={selectedCourse}
        selectedLesson={selectedLesson}
        completedLessons={completedLessons}
        courseContextValue={courseContextValue}
        videoPlayer={videoPlayer}
        fullscreen={fullscreen}
        sidebar={sidebar}
        fileUrl={fileUrl}
        handleBack={handleBack}
        handleLessonSelect={handleLessonSelect}
        handleToggleLessonComplete={handleToggleLessonComplete}
        buildVideoProps={buildVideoProps}
        isCompleted={isCompleted}
      />
    );
  }

  return (
    <CourseProvider value={courseContextValue}>
      <UnsupportedViewer
        selectedLesson={selectedLesson}
        fileUrl={fileUrl}
        isCompleted={isCompleted}
        onToggleComplete={() => handleToggleLessonComplete(selectedLesson)}
        onBack={handleBack}
      />
    </CourseProvider>
  );
};

// === Modo 1: lesson-group (stepper) ===
const LessonGroupPlayer = ({
  selectedCourse,
  selectedLesson,
  currentCourseSteps,
  courseContextValue,
  videoPlayer,
  fullscreen,
  sidebar,
  handleStepComplete,
  handleBack,
  onLessonComplete,
  buildVideoProps,
}) => {
  const videoMaterial = selectedLesson.materials?.video;
  const videoFileUrl = videoMaterial
    ? `http://localhost:3001/cursos/${encodeURIComponent(selectedCourse.title)}/${encodeURIComponent(videoMaterial.path)}`
    : "";
  const vProps = videoMaterial ? buildVideoProps(videoMaterial, videoFileUrl) : {};

  return (
    <CourseProvider value={courseContextValue}>
      <div
        className={`h-screen bg-slate-950 text-slate-100 flex relative ${
          !fullscreen.isFullscreen && sidebar.sidebarPosition === "left"
            ? "flex-row-reverse"
            : ""
        }`}
      >
        <div className={`${fullscreen.isFullscreen ? "w-full" : "flex-1 min-w-0"} h-full bg-slate-900`}>
          <LessonStepper
            lessonGroup={selectedLesson}
            courseTitle={selectedCourse.title}
            completedSteps={currentCourseSteps}
            onStepComplete={handleStepComplete}
            onAllStepsComplete={onLessonComplete}
            {...vProps}
            onBack={handleBack}
            onVideoTimeUpdate={(e) => {
              const video = e.target;
              if (
                video &&
                videoMaterial &&
                !currentCourseSteps[`${selectedLesson.prefix}__video`] &&
                video.currentTime >= video.duration - 1
              ) {
                handleStepComplete(`${selectedLesson.prefix}__video`);
              }
            }}
            onVideoEnded={() => {
              if (!currentCourseSteps[`${selectedLesson.prefix}__video`]) {
                handleStepComplete(`${selectedLesson.prefix}__video`);
              }
            }}
          />
        </div>

        {!fullscreen.isFullscreen && (
          <SidebarSlideout sidebar={sidebar} />
        )}

        <PomodoroTimer
          isVideoPlaying={videoPlayer.isPlaying}
          onPauseVideo={() => {
            const video = videoPlayer.videoRef.current;
            if (video && !video.paused) video.pause();
          }}
          courseTitle={selectedCourse.title}
        />

        <ChatFAB
          courseTitle={selectedCourse.title}
          lessonPrefix={selectedLesson.prefix}
          lessonTitle={selectedLesson.title}
        />
      </div>
    </CourseProvider>
  );
};

// === Modo 2: video legacy (arquivo solto) ===
const LegacyVideoPlayer = ({
  selectedCourse,
  selectedLesson,
  completedLessons,
  courseContextValue,
  videoPlayer,
  fullscreen,
  sidebar,
  fileUrl,
  handleBack,
  handleLessonSelect,
  handleToggleLessonComplete,
  buildVideoProps,
  isCompleted,
}) => {
  const vProps = buildVideoProps(selectedLesson, fileUrl);

  return (
    <CourseProvider value={courseContextValue}>
      <div
        className={`h-screen bg-slate-950 text-slate-100 flex relative ${
          !fullscreen.isFullscreen && sidebar.sidebarPosition === "left"
            ? "flex-row-reverse"
            : ""
        }`}
      >
        <div className={`${fullscreen.isFullscreen ? "w-full" : "flex-1 min-w-0"} h-full bg-slate-900 flex flex-col`}>
          {!fullscreen.isFullscreen && (
            <LegacyHeader
              title={selectedLesson.title}
              isCompleted={isCompleted}
              onBack={handleBack}
              onToggleComplete={() => handleToggleLessonComplete(selectedLesson)}
            />
          )}
          <div className="flex-1 min-h-0">
          <VideoPlayer
            {...vProps}
            courseTitle={selectedCourse.title}
            lessonPrefix={selectedLesson.path}
            onTimeUpdate={(e) => {
              const video = e.target;
              if (
                video &&
                !completedLessons[selectedCourse.title]?.[selectedLesson.path] &&
                video.currentTime >= video.duration - 1
              ) {
                handleToggleLessonComplete(selectedLesson);
              }
            }}
            onEnded={async () => {
              if (!completedLessons[selectedCourse.title]?.[selectedLesson.path]) {
                handleToggleLessonComplete(selectedLesson);
              }
              const next = findNextLesson(selectedCourse.content, selectedLesson.path);
              if (next) handleLessonSelect(next);
            }}
          />
          </div>
        </div>

        {fullscreen.isFullscreen ? (
          <FullscreenSidebar sidebar={sidebar} />
        ) : (
          <SidebarSlideout sidebar={sidebar} />
        )}

        <PomodoroTimer
          isVideoPlaying={videoPlayer.isPlaying}
          onPauseVideo={() => {
            const video = videoPlayer.videoRef.current;
            if (video && !video.paused) video.pause();
          }}
          courseTitle={selectedCourse.title}
        />
      </div>
    </CourseProvider>
  );
};

// Sidebar colapsavel (hover-driven) usada no modo normal.
const SidebarSlideout = ({ sidebar }) => (
  <div
    className="w-8 flex-shrink-0 h-full relative z-20"
    onMouseEnter={() => sidebar.setSidebarHovered(true)}
    onMouseLeave={() => !sidebar.sidebarLocked && sidebar.setSidebarHovered(false)}
  >
    <div
      className={`absolute ${
        sidebar.sidebarPosition === "right" ? "right-0 rounded-l-lg" : "left-0 rounded-r-lg"
      } top-0 h-full bg-gradient-to-b from-slate-900 to-slate-900/95 shadow-2xl overflow-hidden transition-[width] duration-300 ease-in-out`}
      style={{
        width:
          sidebar.sidebarHovered || sidebar.sidebarLocked
            ? "calc(28rem + 2rem)"
            : "2rem",
      }}
    >
      <CourseSidebar
        sidebarPosition={sidebar.sidebarPosition}
        onTogglePosition={sidebar.toggleSidebarPosition}
      />
    </div>
  </div>
);

// Sidebar que desliza quando o video esta em fullscreen.
const FullscreenSidebar = ({ sidebar }) => (
  <>
    <div
      className={`absolute ${
        sidebar.sidebarPosition === "right" ? "right-0" : "left-0"
      } top-0 w-8 h-full z-10 group`}
      onMouseEnter={() => sidebar.setSidebarHovered(true)}
    >
      <div
        className={`absolute ${
          sidebar.sidebarPosition === "right" ? "right-0 rounded-l-full" : "left-0 rounded-r-full"
        } top-1/2 transform -translate-y-1/2 w-1 h-16 bg-gradient-to-b from-transparent via-blue-500 to-transparent opacity-30 group-hover:opacity-60 transition-opacity duration-300`}
      />
    </div>
    <div
      className={`absolute ${
        sidebar.sidebarPosition === "right" ? "right-0 rounded-l-lg" : "left-0 rounded-r-lg"
      } w-[28rem] bg-gradient-to-b from-slate-900 to-slate-900/95 shadow-2xl transform transition-transform duration-300 ease-in-out z-20`}
      style={{
        height: "100vh",
        top: "0",
        transform: `${
          sidebar.sidebarHovered || sidebar.sidebarLocked
            ? "translateX(0)"
            : sidebar.sidebarPosition === "right"
              ? "translateX(100%)"
              : "translateX(-100%)"
        }`,
      }}
      onMouseEnter={() => sidebar.setSidebarHovered(true)}
      onMouseLeave={() => !sidebar.sidebarLocked && sidebar.setSidebarHovered(false)}
    >
      <CourseSidebar
        sidebarPosition={sidebar.sidebarPosition}
        onTogglePosition={sidebar.toggleSidebarPosition}
      />
    </div>
  </>
);

// Header pra aulas legacy (arquivo solto sem stepper). Mostra Voltar +
// titulo + Concluir, igual ao topo do LessonStepper pra manter consistencia.
const LegacyHeader = ({ title, isCompleted, onBack, onToggleComplete }) => (
  <div className="bg-slate-900/95 border-b border-slate-700/40 px-4 py-2.5 flex items-center gap-3">
    <button
      onClick={onBack}
      title="Voltar para a lista de aulas"
      className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/40 text-slate-200 hover:text-white transition-colors flex-shrink-0"
    >
      <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
      <span className="text-xs font-medium">Voltar</span>
    </button>
    <h2
      className="text-slate-200 font-semibold text-sm flex-1 truncate"
      title={title}
    >
      {title}
    </h2>
    <button
      onClick={onToggleComplete}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
        isCompleted
          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
          : "bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border border-slate-600/30"
      }`}
    >
      {isCompleted ? (
        <CheckCircle className="w-3.5 h-3.5" />
      ) : (
        <Circle className="w-3.5 h-3.5" />
      )}
      {isCompleted ? "Concluido" : "Concluir"}
    </button>
  </div>
);

export default LessonPlayer;
