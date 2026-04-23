import React, { useState, useEffect } from "react";
import { Settings } from "lucide-react";

import { CourseProvider } from "./CourseContext";
import CourseCard from "./CourseCard";
import ConfigModal from "./ConfigModal";
import ModuleItem from "./ModuleItem";
import CourseSidebar from "./CourseSidebar";
import VideoPlayer from "./VideoPlayer";
import PDFViewer from "./PDFViewer";
import HTMLViewer from "./HTMLViewer";
import UnsupportedViewer from "./UnsupportedViewer";
import LessonStepper from "./LessonStepper";
import PomodoroTimer from "./PomodoroTimer";
import WeeklyDiaryModal, { shouldShowDiaryPrompt, markDiaryPrompted } from "./WeeklyDiaryModal";
import DailyReview from "./DailyReview";
import Dashboard from "./Dashboard";
import BulkAIGenerateModal from "./BulkAIGenerateModal";

import useCourseData from "../hooks/useCourseData";
import useCourseProgress from "../hooks/useCourseProgress";
import useVideoPlayer from "../hooks/useVideoPlayer";
import useFullscreen from "../hooks/useFullscreen";
import useSidebar from "../hooks/useSidebar";
import useLessonAccuracy from "../hooks/useLessonAccuracy";

import {
  flattenCourseContent,
  findNextLesson,
  findPreviousLesson,
  countLessons,
  countCompletedLessons,
  moduleContainsLesson,
  countWeakModules,
} from "../utils/courseUtils";
import { isVideoFile, isPDFFile, isHTMLFile } from "../utils/fileUtils";

const MainComponent = () => {
  const [view, setView] = useState("courses");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [expandedModules, setExpandedModules] = useState({});
  const [showDiaryModal, setShowDiaryModal] = useState(false);
  const [diaryAutoPrompted, setDiaryAutoPrompted] = useState(false);
  const [showBulkAIModal, setShowBulkAIModal] = useState(false);

  const courseData = useCourseData();
  const lessonAccuracy = useLessonAccuracy(selectedCourse?.title);
  const {
    completedLessons,
    completedSteps,
    toggleLessonComplete,
    toggleStepComplete,
  } = useCourseProgress();
  const videoPlayer = useVideoPlayer();
  const fullscreen = useFullscreen();
  const sidebar = useSidebar();

  const {
    courses,
    loading,
    coursesPath,
    setCoursesPath,
    videoDurations,
    setVideoDurations,
    loadingVideos,
    loadVideoDuration,
    saveCoursesPath,
  } = courseData;

  // Auto-prompt diary after 1 week
  useEffect(() => {
    if (selectedCourse && !diaryAutoPrompted) {
      if (shouldShowDiaryPrompt(selectedCourse.title)) {
        setShowDiaryModal(true);
        setDiaryAutoPrompted(true);
      }
    }
  }, [selectedCourse?.title]);

  const handleStepComplete = (stepKey) => {
    if (!selectedCourse) return;
    toggleStepComplete(selectedCourse.title, stepKey);
  };

  // Fatia por curso atual (os consumers esperam shape flat { [fullKey]: bool })
  const currentCourseSteps = selectedCourse
    ? completedSteps[selectedCourse.title] || {}
    : {};

  const toggleModuleExpansion = (modulePath) => {
    if (!modulePath) return;
    setExpandedModules((prev) => ({
      ...prev,
      [modulePath]: !prev[modulePath],
    }));
  };

  // Auto-expandir módulo da aula ativa
  useEffect(() => {
    if (selectedLesson && selectedLesson.path && selectedCourse) {
      const newExpandedModules = {};

      const processModules = (content) => {
        content.forEach((item) => {
          if (item.type === "module") {
            const containsCurrent = moduleContainsLesson(
              item.content,
              selectedLesson.path
            );
            newExpandedModules[item.path] = containsCurrent;
            if (item.content) processModules(item.content);
          }
        });
      };

      processModules(selectedCourse.content);
      setExpandedModules(newExpandedModules);
    }
  }, [selectedLesson, selectedCourse, completedLessons]);

  // Capturar duração quando vídeo carrega no player principal
  useEffect(() => {
    if (selectedLesson && videoPlayer.videoRef.current) {
      const video = videoPlayer.videoRef.current;

      const handleLoadedMetadata = () => {
        if (selectedLesson.path && video.duration) {
          setVideoDurations((prev) => ({
            ...prev,
            [selectedLesson.path]: video.duration,
          }));
        }
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      return () =>
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    }
  }, [selectedLesson]);

  // Setup video listeners
  useEffect(() => {
    // For lesson groups, pass the video material as the lesson
    const videoLesson =
      selectedLesson?.type === "lesson-group"
        ? selectedLesson.materials?.video
        : selectedLesson;
    return videoPlayer.setupVideoListeners(videoLesson);
  }, [selectedLesson, videoPlayer.setupVideoListeners]);

  // Carregar durações de todos os vídeos do curso
  useEffect(() => {
    if (!selectedCourse || !selectedCourse.content) return;

    const getAllVideos = (content, videos = []) => {
      content.forEach((item) => {
        if (item.type === "lesson" && item.title && isVideoFile(item.title)) {
          videos.push(item.path);
        } else if (item.type === "lesson-group" && item.materials?.video) {
          videos.push(item.materials.video.path);
        } else if (item.type === "module" && item.content) {
          getAllVideos(item.content, videos);
        }
      });
      return videos;
    };

    const allVideos = getAllVideos(selectedCourse.content);
    allVideos.forEach((videoPath, index) => {
      setTimeout(async () => {
        await loadVideoDuration(videoPath, selectedCourse.title);
      }, index * 500);
    });
  }, [selectedCourse?.title]);

  // Handlers de teclado
  useEffect(() => {
    if (!selectedLesson || !selectedCourse) return;

    const handleKeyDown = (e) => {
      const video = videoPlayer.videoRef.current;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          videoPlayer.seekRelative(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          videoPlayer.seekRelative(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          const prevLesson = findPreviousLesson(
            selectedCourse.content,
            selectedLesson.path
          );
          if (prevLesson) handleLessonSelect(prevLesson);
          break;
        case "ArrowDown":
          e.preventDefault();
          const nextLesson = findNextLesson(
            selectedCourse.content,
            selectedLesson.path
          );
          if (nextLesson) handleLessonSelect(nextLesson);
          break;
      }

      if (fullscreen.isFullscreen) {
        switch (e.key) {
          case "Escape":
          case "f":
          case "F":
            fullscreen.exitFullscreen();
            break;
          case " ":
            e.preventDefault();
            if (video) video.paused ? video.play() : video.pause();
            break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    fullscreen.isFullscreen,
    selectedLesson,
    selectedCourse,
    videoPlayer.duration,
  ]);

  const handleCourseSelect = (course) => {
    setSelectedCourse(course);
    setView("lessons");
    setDiaryAutoPrompted(false);
  };

  const handleLessonSelect = (lesson) => {
    setSelectedLesson(lesson);
  };

  const handleToggleLessonComplete = (lesson) => {
    toggleLessonComplete(
      lesson,
      selectedCourse.title,
      selectedCourse.content,
      handleLessonSelect
    );
  };

  const handleBack = () => {
    if (selectedLesson) {
      setSelectedLesson(null);
      sidebar.setSidebarVisible(true);
    } else {
      setSelectedCourse(null);
      setView("courses");
    }
  };

  // Shared video props for both standalone and stepper video
  const buildVideoProps = (lesson, fileUrl) => ({
    videoRef: videoPlayer.videoRef,
    videoContainerRef: fullscreen.videoContainerRef,
    fileUrl,
    selectedLesson: lesson,
    isPlaying: videoPlayer.isPlaying,
    currentTime: videoPlayer.currentTime,
    duration: videoPlayer.duration,
    volume: videoPlayer.volume,
    playbackRate: videoPlayer.playbackRate,
    isDragging: videoPlayer.isDragging,
    isFullscreen: fullscreen.isFullscreen,
    showTopControls: fullscreen.showTopControls,
    showBottomControls: fullscreen.showBottomControls,
    sidebarPosition: sidebar.sidebarPosition,
    sidebarHovered: sidebar.sidebarHovered,
    sidebarLocked: sidebar.sidebarLocked,
    onVideoClick: () =>
      videoPlayer.handleVideoClick(fullscreen.toggleFullscreen),
    onTogglePlayPause: videoPlayer.togglePlayPause,
    onTimelineClick: videoPlayer.handleTimelineClick,
    onTimelineDrag: videoPlayer.handleTimelineDrag,
    onDragStart: () => videoPlayer.setIsDragging(true),
    onDragEnd: () => videoPlayer.setIsDragging(false),
    onChangeVolume: videoPlayer.changeVolume,
    onChangePlaybackRate: videoPlayer.changePlaybackRate,
    onEnterFullscreen: fullscreen.enterFullscreen,
    onExitFullscreen: fullscreen.exitFullscreen,
    onSetShowTopControls: fullscreen.setShowTopControls,
    onSetShowBottomControls: fullscreen.setShowBottomControls,
    onSidebarHover: () => sidebar.setSidebarHovered(true),
    onSidebarLeave: () => sidebar.setSidebarHovered(false),
    onSidebarLock: () => sidebar.setSidebarLocked(true),
    onSidebarUnlock: () => sidebar.setSidebarLocked(false),
    onToggleSidebarPosition: sidebar.toggleSidebarPosition,
    onBack: handleBack,
  });

  const courseContextValue = {
    selectedCourse,
    selectedLesson,
    completedLessons,
    completedSteps: currentCourseSteps,
    expandedModules,
    toggleModuleExpansion,
    videoDurations,
    loadingVideos,
    onSelectLesson: handleLessonSelect,
    onToggleLessonComplete: handleToggleLessonComplete,
    lessonAccuracy: lessonAccuracy.map,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Carregando cursos...</span>
        </div>
      </div>
    );
  }

  // Tela de revisao diaria (flashcards de todos os cursos)
  if (view === "review") {
    return <DailyReview onBack={() => setView("courses")} />;
  }

  // Dashboard
  if (view === "dashboard") {
    return <Dashboard onBack={() => setView("courses")} />;
  }

  // Tela de listagem de aulas do curso
  if (view === "lessons" && selectedCourse && !selectedLesson) {
    const courseProgress = completedLessons[selectedCourse.title] || {};
    const totalLessons = countLessons(selectedCourse.content);
    const completedCount = countCompletedLessons(
      selectedCourse.content,
      courseProgress,
      currentCourseSteps
    );

    const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    return (
      <CourseProvider value={courseContextValue}>
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
          {/* Course header */}
          <div className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="max-w-4xl mx-auto px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleBack}
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

              {/* Progress bar */}
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

          {/* Lesson list */}
          <div className="max-w-4xl mx-auto px-6 py-6">
            {(() => {
              const weak = countWeakModules(selectedCourse.content, lessonAccuracy.map);
              if (weak === 0) return null;
              return (
                <div className="mb-5 flex items-center gap-3 bg-red-950/25 border border-red-500/25 rounded-xl px-4 py-3">
                  <span className="text-red-300 text-lg">⚠</span>
                  <div className="flex-1 text-sm">
                    <div className="text-red-100 font-medium">
                      {weak} módulo{weak > 1 ? "s" : ""} com acerto abaixo de 60%
                    </div>
                    <div className="text-red-300/80 text-xs mt-0.5">
                      Recomendo revisar antes de seguir adiante. FSRS vai repriorizar cards fracos.
                    </div>
                  </div>
                  <button
                    onClick={() => setView("review")}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-xs text-red-200 font-medium transition-colors"
                  >
                    Revisar agora
                  </button>
                </div>
              );
            })()}
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
            // Recarrega a lista de cursos/aulas para refletir os novos arquivos _ia
            setTimeout(() => window.location.reload(), 800);
          }}
        />
      </CourseProvider>
    );
  }

  // Tela de visualização de aula
  if (selectedLesson) {
    const isLessonGroup = selectedLesson.type === "lesson-group";

    // LESSON GROUP - nova experiência com stepper
    if (isLessonGroup) {
      const videoMaterial = selectedLesson.materials?.video;
      const videoFileUrl = videoMaterial
        ? `http://localhost:3001/cursos/${encodeURIComponent(selectedCourse.title)}/${encodeURIComponent(videoMaterial.path)}`
        : "";

      const vProps = videoMaterial
        ? buildVideoProps(videoMaterial, videoFileUrl)
        : {};

      return (
        <CourseProvider value={courseContextValue}>
          <div
            className={`h-screen bg-slate-950 text-slate-100 flex relative ${
              !fullscreen.isFullscreen && sidebar.sidebarPosition === "left"
                ? "flex-row-reverse"
                : ""
            }`}
          >
            <div
              className={`${
                fullscreen.isFullscreen ? "w-full" : "flex-1 min-w-0"
              } h-full bg-slate-900`}
            >
              <LessonStepper
                lessonGroup={selectedLesson}
                courseTitle={selectedCourse.title}
                completedSteps={currentCourseSteps}
                onStepComplete={handleStepComplete}
                onAllStepsComplete={(lesson) => {
                  if (!completedLessons[selectedCourse.title]?.[lesson.path]) {
                    toggleLessonComplete(lesson, selectedCourse.title, selectedCourse.content, handleLessonSelect);
                  }
                }}
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
              <div
                className="w-8 flex-shrink-0 h-full relative z-20"
                onMouseEnter={() => sidebar.setSidebarHovered(true)}
                onMouseLeave={() =>
                  !sidebar.sidebarLocked && sidebar.setSidebarHovered(false)
                }
              >
                <div
                  className={`absolute ${
                    sidebar.sidebarPosition === "right"
                      ? "right-0 rounded-l-lg"
                      : "left-0 rounded-r-lg"
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
    }

    // LEGACY - aula simples (arquivo unico, sem materiais complementares)
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
                  onToggleComplete={() =>
                    handleToggleLessonComplete(selectedLesson)
                  }
                  onBack={handleBack}
                />
              ) : (
                <PDFViewer
                  selectedLesson={selectedLesson}
                  fileUrl={fileUrl}
                  isCompleted={isCompleted}
                  onToggleComplete={() =>
                    handleToggleLessonComplete(selectedLesson)
                  }
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
            <div
              className={`${
                fullscreen.isFullscreen ? "w-full" : "flex-1 min-w-0"
              } h-full bg-slate-900`}
            >
              <VideoPlayer
                {...vProps}
                onTimeUpdate={(e) => {
                  const video = e.target;
                  if (
                    video &&
                    !completedLessons[selectedCourse.title]?.[
                      selectedLesson.path
                    ] &&
                    video.currentTime >= video.duration - 1
                  ) {
                    handleToggleLessonComplete(selectedLesson);
                  }
                }}
                onEnded={async () => {
                  if (
                    !completedLessons[selectedCourse.title]?.[
                      selectedLesson.path
                    ]
                  ) {
                    handleToggleLessonComplete(selectedLesson);
                  }
                  const next = findNextLesson(
                    selectedCourse.content,
                    selectedLesson.path
                  );
                  if (next) handleLessonSelect(next);
                }}
              />
            </div>

            {fullscreen.isFullscreen ? (
              <>
                <div
                  className={`absolute ${
                    sidebar.sidebarPosition === "right" ? "right-0" : "left-0"
                  } top-0 w-8 h-full z-10 group`}
                  onMouseEnter={() => sidebar.setSidebarHovered(true)}
                >
                  <div
                    className={`absolute ${
                      sidebar.sidebarPosition === "right"
                        ? "right-0 rounded-l-full"
                        : "left-0 rounded-r-full"
                    } top-1/2 transform -translate-y-1/2 w-1 h-16 bg-gradient-to-b from-transparent via-blue-500 to-transparent opacity-30 group-hover:opacity-60 transition-opacity duration-300`}
                  ></div>
                </div>

                <div
                  className={`absolute ${
                    sidebar.sidebarPosition === "right"
                      ? "right-0 rounded-l-lg"
                      : "left-0 rounded-r-lg"
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
                  onMouseLeave={() =>
                    !sidebar.sidebarLocked && sidebar.setSidebarHovered(false)
                  }
                >
                  <CourseSidebar
                    sidebarPosition={sidebar.sidebarPosition}
                    onTogglePosition={sidebar.toggleSidebarPosition}
                  />
                </div>
              </>
            ) : (
              <div
                className="w-8 flex-shrink-0 h-full relative z-20"
                onMouseEnter={() => sidebar.setSidebarHovered(true)}
                onMouseLeave={() =>
                  !sidebar.sidebarLocked && sidebar.setSidebarHovered(false)
                }
              >
                <div
                  className={`absolute ${
                    sidebar.sidebarPosition === "right"
                      ? "right-0 rounded-l-lg"
                      : "left-0 rounded-r-lg"
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
  }

  // Tela principal - lista de cursos
  const totalAllLessons = courses.reduce((sum, c) => sum + countLessons(c.content || []), 0);
  const totalAllCompleted = courses.reduce((sum, c) => {
    const progress = completedLessons[c.title] || {};
    const steps = completedSteps[c.title] || {};
    return sum + countCompletedLessons(c.content || [], progress, steps);
  }, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/60">
        <div className="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">
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
            {/* Study stats */}
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
                  <div className="text-lg font-bold text-blue-400">{totalAllLessons > 0 ? Math.round((totalAllCompleted / totalAllLessons) * 100) : 0}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Progresso</div>
                </div>
              </div>
            )}
            <button
              onClick={() => setView("dashboard")}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 rounded-xl transition-all text-sm text-emerald-300 hover:text-emerald-200"
              title="Dashboard de estudo"
            >
              <span>📊</span>
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => setView("review")}
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

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Overall progress bar */}
        {totalAllLessons > 0 && (
          <div className="mb-8 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Progresso geral</span>
              <span className="text-sm font-medium text-slate-300">{totalAllCompleted} de {totalAllLessons} aulas</span>
            </div>
            <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${(totalAllCompleted / totalAllLessons) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course, index) => {
            const courseProgress = completedLessons[course.title] || {};
            const courseSteps = completedSteps[course.title] || {};
            const total = countLessons(course.content || []);
            const completed = countCompletedLessons(course.content || [], courseProgress, courseSteps);
            return (
              <div
                key={index}
                onClick={() => handleCourseSelect(course)}
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

export default MainComponent;
