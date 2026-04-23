import React from "react";
import { CourseProvider } from "./CourseContext";
import ModuleItem from "./ModuleItem";
import LessonStepper from "./LessonStepper";
import VideoPlayer from "./VideoPlayer";
import HTMLViewer from "./HTMLViewer";
import PDFViewer from "./PDFViewer";
import UnsupportedViewer from "./UnsupportedViewer";
import CourseSidebar from "./CourseSidebar";
import PomodoroTimer from "./PomodoroTimer";
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
        handleLessonSelect={handleLessonSelect}
        handleToggleLessonComplete={handleToggleLessonComplete}
        buildVideoProps={buildVideoProps}
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
  handleLessonSelect,
  handleToggleLessonComplete,
  buildVideoProps,
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
        <div className={`${fullscreen.isFullscreen ? "w-full" : "flex-1 min-w-0"} h-full bg-slate-900`}>
          <VideoPlayer
            {...vProps}
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

export default LessonPlayer;
