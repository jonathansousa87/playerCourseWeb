import React, { useState, useEffect, useRef } from "react";

import CoursesScreen from "./CoursesScreen";
import LessonsView from "./LessonsView";
import LessonPlayer from "./LessonPlayer";
import DailyReview from "./DailyReview";
import Dashboard from "./Dashboard";
import TypingCourse from "./typing/TypingCourse";
import { shouldShowDiaryPrompt } from "./WeeklyDiaryModal";

import useCourseData from "../hooks/useCourseData";
import useCourseProgress from "../hooks/useCourseProgress";
import useTypingProgress from "../hooks/useTypingProgress";
import useVideoPlayer from "../hooks/useVideoPlayer";
import useFullscreen from "../hooks/useFullscreen";
import useSidebar from "../hooks/useSidebar";
import useLessonAccuracy from "../hooks/useLessonAccuracy";

import {
  findNextLesson,
  findPreviousLesson,
  moduleContainsLesson,
  flattenCourseContent,
} from "../utils/courseUtils";
import { isVideoFile } from "../utils/fileUtils";
import { clearCourseMaterials } from "../utils/progressApi";

const MainComponent = () => {
  const [view, setView] = useState("courses");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [expandedModules, setExpandedModules] = useState({});
  const [showDiaryModal, setShowDiaryModal] = useState(false);
  const activeStepRef = useRef("video");
  const [diaryAutoPrompted, setDiaryAutoPrompted] = useState(false);
  const [showBulkAIModal, setShowBulkAIModal] = useState(false);

  const courseData = useCourseData();
  const lessonAccuracy = useLessonAccuracy(selectedCourse?.title);
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
    reloadCourses,
  } = courseData;

  const videoPlayer = useVideoPlayer();
  const fullscreen = useFullscreen();
  const sidebar = useSidebar();

  const {
    completedLessons,
    completedSteps,
    toggleLessonComplete,
    toggleStepComplete,
  } = useCourseProgress();

  const typing = useTypingProgress();

  // Após reloadCourses() (ex.: pós-geração de IA), o array `courses` traz
  // objetos novos. Re-resolve a seleção atual a partir dos dados frescos para
  // que materiais recém-gerados apareçam sem recarregar a página inteira.
  useEffect(() => {
    if (!selectedCourse) return;
    const freshCourse = courses.find((c) => c.title === selectedCourse.title);
    if (!freshCourse || freshCourse === selectedCourse) return;
    setSelectedCourse(freshCourse);

    if (selectedLesson) {
      const freshLesson = flattenCourseContent(freshCourse.content).find((l) =>
        selectedLesson.type === "lesson-group"
          ? l.prefix === selectedLesson.prefix
          : l.path === selectedLesson.path
      );
      if (freshLesson) setSelectedLesson(freshLesson);
    }
  }, [courses, selectedCourse, selectedLesson]);

  // Prompt do diario semanal quando aplicavel.
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

  // Auto-expande o modulo que contem a aula ativa.
  useEffect(() => {
    if (selectedLesson && selectedLesson.path && selectedCourse) {
      const newExpandedModules = {};
      const processModules = (content) => {
        content.forEach((item) => {
          if (item.type === "module") {
            newExpandedModules[item.path] = moduleContainsLesson(
              item.content,
              selectedLesson.path,
            );
            if (item.content) processModules(item.content);
          }
        });
      };
      processModules(selectedCourse.content);
      setExpandedModules(newExpandedModules);
    }
  }, [selectedLesson, selectedCourse, completedLessons]);

  // Captura duracao do video principal quando o metadata carrega.
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

  useEffect(() => {
    const videoLesson =
      selectedLesson?.type === "lesson-group"
        ? selectedLesson.materials?.video
        : selectedLesson;
    return videoPlayer.setupVideoListeners(videoLesson);
  }, [selectedLesson, videoPlayer.setupVideoListeners]);

  // Pre-carrega duracoes dos videos do curso pra exibir na lista.
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

  // Atalhos globais de teclado (seek/navegacao/fullscreen).
  // Atalhos de seek e navegação de aula só disparam quando o step ativo é "video".
  useEffect(() => {
    if (!selectedLesson || !selectedCourse) return;
    const handleKeyDown = (e) => {
      const video = videoPlayer.videoRef.current;
      if (activeStepRef.current === "video") {
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            videoPlayer.seekRelative(-10);
            break;
          case "ArrowRight":
            e.preventDefault();
            videoPlayer.seekRelative(10);
            break;
          case "ArrowUp": {
            e.preventDefault();
            const prev = findPreviousLesson(selectedCourse.content, selectedLesson.path);
            if (prev) handleLessonSelect(prev);
            break;
          }
          case "ArrowDown": {
            e.preventDefault();
            const next = findNextLesson(selectedCourse.content, selectedLesson.path);
            if (next) handleLessonSelect(next);
            break;
          }
        }
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
  }, [fullscreen.isFullscreen, selectedLesson, selectedCourse, videoPlayer.duration]);

  const handleCourseSelect = (course) => {
    setSelectedCourse(course);
    setView("lessons");
    setDiaryAutoPrompted(false);
  };

  const handleClearMaterials = async (course) => {
    const ok = window.confirm(
      `Apagar TODO o material gerado por IA de "${course.title}"?\n\n` +
        "Remove resumos, quizzes, exemplos, flashcards, diario e pre-quiz do banco. " +
        "Nao apaga seu progresso nem os arquivos do curso no Drive.",
    );
    if (!ok) return;
    try {
      const res = await clearCourseMaterials(course.title);
      const { materials = 0, flashcardDecks = 0, prequestions = 0 } = res.deleted || {};
      await reloadCourses();
      window.alert(
        `Material removido: ${materials} materiais, ${flashcardDecks} decks de flashcards, ${prequestions} pre-quiz.`,
      );
    } catch (err) {
      console.error("Erro ao limpar materiais:", err);
      window.alert(`Falha ao limpar materiais: ${err.message}`);
    }
  };

  const handleLessonSelect = (lesson) => setSelectedLesson(lesson);

  const handleToggleLessonComplete = (lesson) => {
    toggleLessonComplete(
      lesson,
      selectedCourse.title,
      selectedCourse.content,
      handleLessonSelect,
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

  // Props compartilhadas do VideoPlayer (player standalone e stepper).
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
    onVideoClick: () => videoPlayer.handleVideoClick(fullscreen.toggleFullscreen),
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
    onSidebarUnlock: () => sidebar.setSidebarUnlock(false),
    onToggleSidebarPosition: sidebar.toggleSidebarPosition,
    onSetupListeners: videoPlayer.setupVideoListeners,
    onInternalTimeUpdate: videoPlayer.handleTimeUpdate,
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

  if (view === "review") {
    return <DailyReview onBack={() => setView("courses")} />;
  }

  if (view === "dashboard") {
    return <Dashboard onBack={() => setView("courses")} />;
  }

  if (view === "typing") {
    return (
      <TypingCourse
        progress={typing.progress}
        saveResult={typing.saveResult}
        completedCount={typing.completedCount}
        onBack={() => setView("courses")}
      />
    );
  }

  if (view === "lessons" && selectedCourse && !selectedLesson) {
    return (
      <LessonsView
        selectedCourse={selectedCourse}
        completedLessons={completedLessons}
        currentCourseSteps={currentCourseSteps}
        lessonAccuracy={lessonAccuracy.map}
        onBack={handleBack}
        onView={setView}
        showDiaryModal={showDiaryModal}
        setShowDiaryModal={setShowDiaryModal}
        showBulkAIModal={showBulkAIModal}
        setShowBulkAIModal={setShowBulkAIModal}
        courseContextValue={courseContextValue}
        onMaterialsChanged={reloadCourses}
      />
    );
  }

  if (selectedLesson) {
    return (
      <LessonPlayer
        selectedCourse={selectedCourse}
        selectedLesson={selectedLesson}
        completedLessons={completedLessons}
        currentCourseSteps={currentCourseSteps}
        courseContextValue={courseContextValue}
        videoPlayer={videoPlayer}
        fullscreen={fullscreen}
        sidebar={sidebar}
        handleBack={handleBack}
        handleStepComplete={handleStepComplete}
        handleToggleLessonComplete={handleToggleLessonComplete}
        handleLessonSelect={handleLessonSelect}
        toggleLessonComplete={toggleLessonComplete}
        buildVideoProps={buildVideoProps}
        onStepChange={(step) => { activeStepRef.current = step; }}
        onMaterialsChanged={reloadCourses}
      />
    );
  }

  return (
    <CoursesScreen
      courses={courses}
      completedLessons={completedLessons}
      completedSteps={completedSteps}
      videoDurations={videoDurations}
      coursesPath={coursesPath}
      setCoursesPath={setCoursesPath}
      saveCoursesPath={saveCoursesPath}
      showConfigModal={showConfigModal}
      setShowConfigModal={setShowConfigModal}
      onSelectCourse={handleCourseSelect}
      onClearMaterials={handleClearMaterials}
      onOpenTyping={() => setView("typing")}
      typingCompleted={typing.completedCount}
      onView={setView}
      onCoursesChanged={reloadCourses}
    />
  );
};

export default MainComponent;
