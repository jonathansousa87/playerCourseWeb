import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, CheckCircle, Circle, Sparkles } from "lucide-react";
import VideoPlayer from "./VideoPlayer";
import MarkdownViewer from "./MarkdownViewer";
import FlashcardViewer from "./FlashcardViewer";
import QuizViewer from "./QuizViewer";
import ExamplesViewer from "./ExamplesViewer";
import TechnicalDiary from "./TechnicalDiary";
import PersonalSummary from "./PersonalSummary";
import AIGenerateModal from "./AIGenerateModal";

const STEP_CONFIG = [
  { key: "video", label: "Video", icon: "▶", color: "blue" },
  { key: "resumo", label: "Resumo", icon: "📄", color: "emerald" },
  { key: "exemplos", label: "Exemplos", icon: "💡", color: "amber" },
  { key: "quiz", label: "Quiz", icon: "❓", color: "purple" },
  { key: "flashcards", label: "Flashcards", icon: "🔁", color: "cyan" },
  { key: "diario", label: "Diario", icon: "📓", color: "rose" },
  { key: "pessoal", label: "Meu Resumo", icon: "✏️", color: "orange", always: true },
];

const StepTab = ({ step, isActive, isCompleted, onClick }) => {
  const colorMap = {
    blue: { active: "bg-blue-600/90 border-blue-500/60 text-white shadow-blue-500/15", completed: "text-blue-400 border-blue-500/20 bg-blue-500/8" },
    emerald: { active: "bg-emerald-600/90 border-emerald-500/60 text-white shadow-emerald-500/15", completed: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8" },
    amber: { active: "bg-amber-600/90 border-amber-500/60 text-white shadow-amber-500/15", completed: "text-amber-400 border-amber-500/20 bg-amber-500/8" },
    purple: { active: "bg-purple-600/90 border-purple-500/60 text-white shadow-purple-500/15", completed: "text-purple-400 border-purple-500/20 bg-purple-500/8" },
    cyan: { active: "bg-cyan-600/90 border-cyan-500/60 text-white shadow-cyan-500/15", completed: "text-cyan-400 border-cyan-500/20 bg-cyan-500/8" },
    rose: { active: "bg-rose-600/90 border-rose-500/60 text-white shadow-rose-500/15", completed: "text-rose-400 border-rose-500/20 bg-rose-500/8" },
    orange: { active: "bg-orange-600/90 border-orange-500/60 text-white shadow-orange-500/15", completed: "text-orange-400 border-orange-500/20 bg-orange-500/8" },
  };

  const colors = colorMap[step.color];

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
        isActive
          ? `${colors.active} shadow-lg`
          : isCompleted
          ? `${colors.completed}`
          : "bg-slate-800/40 border-slate-700/40 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 hover:border-slate-600/50"
      }`}
    >
      <span className="text-sm">{step.icon}</span>
      <span>{step.label}</span>
      {isCompleted && !isActive && (
        <CheckCircle className="w-3.5 h-3.5 ml-0.5 opacity-70" />
      )}
    </button>
  );
};

const LessonStepper = ({
  lessonGroup,
  courseTitle,
  completedSteps,
  onStepComplete,
  onAllStepsComplete,
  // Video props
  videoRef,
  videoContainerRef,
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackRate,
  isDragging,
  isFullscreen,
  showTopControls,
  showBottomControls,
  sidebarPosition,
  sidebarHovered,
  sidebarLocked,
  onVideoClick,
  onTogglePlayPause,
  onTimelineClick,
  onTimelineDrag,
  onDragStart,
  onDragEnd,
  onChangeVolume,
  onChangePlaybackRate,
  onEnterFullscreen,
  onExitFullscreen,
  onSetShowTopControls,
  onSetShowBottomControls,
  onSidebarHover,
  onSidebarLeave,
  onSidebarLock,
  onSidebarUnlock,
  onToggleSidebarPosition,
  onBack,
  onVideoTimeUpdate,
  onVideoEnded,
}) => {
  const [activeStep, setActiveStep] = useState("video");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const materials = lessonGroup.materials || {};

  // Available steps: from materials + "pessoal" always present
  const availableSteps = STEP_CONFIG.filter(
    (step) => step.always || materials[step.key]
  );

  // Reset active step when lesson changes
  useEffect(() => {
    if (materials.video) {
      setActiveStep("video");
    } else {
      const first = availableSteps[0];
      if (first) setActiveStep(first.key);
    }
  }, [lessonGroup.prefix]);

  const isStepCompleted = (key) =>
    !!completedSteps[`${lessonGroup.prefix}__${key}`];

  const completedCount = availableSteps.filter((step) =>
    isStepCompleted(step.key)
  ).length;

  const allComplete = completedCount === availableSteps.length;

  // Check if all steps are done → notify parent
  useEffect(() => {
    if (allComplete && onAllStepsComplete) {
      onAllStepsComplete(lessonGroup);
    }
  }, [allComplete]);

  const buildFileUrl = (material) => {
    if (!material) return "";
    return `http://localhost:3001/cursos/${encodeURIComponent(courseTitle)}/${encodeURIComponent(material.path)}`;
  };

  const handleMarkComplete = (stepKey) => {
    onStepComplete(`${lessonGroup.prefix}__${stepKey}`);
  };

  // Advance to next available step
  const advanceToNextStep = useCallback(() => {
    const currentIdx = availableSteps.findIndex((s) => s.key === activeStep);
    if (currentIdx < availableSteps.length - 1) {
      setActiveStep(availableSteps[currentIdx + 1].key);
    }
  }, [activeStep, availableSteps]);

  // Handle video ended: mark complete + auto-advance to resumo
  const handleVideoEnded = useCallback(() => {
    onVideoEnded?.();
    advanceToNextStep();
  }, [onVideoEnded, advanceToNextStep]);

  const renderActiveContent = () => {
    // Personal summary tab (always available, no material file)
    if (activeStep === "pessoal") {
      return (
        <PersonalSummary
          courseTitle={courseTitle}
          lessonPrefix={lessonGroup.prefix}
          isCompleted={isStepCompleted("pessoal")}
          onMarkComplete={handleMarkComplete}
        />
      );
    }


    const material = materials[activeStep];
    if (!material) return null;
    const fileUrl = buildFileUrl(material);

    switch (activeStep) {
      case "video":
        return (
          <VideoPlayer
            videoRef={videoRef}
            videoContainerRef={videoContainerRef}
            fileUrl={fileUrl}
            selectedLesson={material}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            playbackRate={playbackRate}
            isDragging={isDragging}
            isFullscreen={isFullscreen}
            showTopControls={showTopControls}
            showBottomControls={showBottomControls}
            sidebarPosition={sidebarPosition}
            sidebarHovered={sidebarHovered}
            sidebarLocked={sidebarLocked}
            onVideoClick={onVideoClick}
            onTogglePlayPause={onTogglePlayPause}
            onTimelineClick={onTimelineClick}
            onTimelineDrag={onTimelineDrag}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onChangeVolume={onChangeVolume}
            onChangePlaybackRate={onChangePlaybackRate}
            onEnterFullscreen={onEnterFullscreen}
            onExitFullscreen={onExitFullscreen}
            onSetShowTopControls={onSetShowTopControls}
            onSetShowBottomControls={onSetShowBottomControls}
            onSidebarHover={onSidebarHover}
            onSidebarLeave={onSidebarLeave}
            onSidebarLock={onSidebarLock}
            onSidebarUnlock={onSidebarUnlock}
            onToggleSidebarPosition={onToggleSidebarPosition}
            onBack={onBack}
            onTimeUpdate={onVideoTimeUpdate}
            onEnded={handleVideoEnded}
          />
        );

      case "resumo":
        return (
          <div className="flex flex-col h-full">
            <StepHeader
              title="Resumo"
              stepKey={activeStep}
              isCompleted={isStepCompleted(activeStep)}
              onMarkComplete={handleMarkComplete}
            />
            <div className="flex-1 overflow-hidden">
              <MarkdownViewer fileUrl={fileUrl} />
            </div>
          </div>
        );

      case "exemplos":
        return (
          <div className="flex flex-col h-full">
            <StepHeader
              title="Exemplos Práticos"
              stepKey={activeStep}
              isCompleted={isStepCompleted(activeStep)}
              onMarkComplete={handleMarkComplete}
            />
            <div className="flex-1 overflow-hidden">
              <ExamplesViewer fileUrl={fileUrl} />
            </div>
          </div>
        );

      case "quiz":
        return (
          <div className="flex flex-col h-full">
            <StepHeader
              title="Quiz"
              stepKey={activeStep}
              isCompleted={isStepCompleted(activeStep)}
              onMarkComplete={handleMarkComplete}
            />
            <div className="flex-1 overflow-hidden">
              <QuizViewer
                fileUrl={fileUrl}
                courseTitle={courseTitle}
                lessonPrefix={lessonGroup.prefix}
                onPass={() => {
                  if (!isStepCompleted("quiz")) handleMarkComplete("quiz");
                }}
              />
            </div>
          </div>
        );

      case "flashcards":
        return (
          <div className="flex flex-col h-full">
            <StepHeader
              title="Flashcards"
              stepKey={activeStep}
              isCompleted={isStepCompleted("flashcards")}
              onMarkComplete={handleMarkComplete}
            />
            <div className="flex-1 overflow-hidden">
              <FlashcardViewer
                courseTitle={courseTitle}
                lessonPrefix={lessonGroup.prefix}
              />
            </div>
          </div>
        );

      case "diario":
        return (
          <TechnicalDiary
            courseTitle={courseTitle}
            lessonPrefix={lessonGroup.prefix}
            templateUrl={fileUrl}
            isCompleted={isStepCompleted("diario")}
            onMarkComplete={handleMarkComplete}
          />
        );

      default:
        return null;
    }
  };

  const hideStepperTabs = activeStep === "video" && isFullscreen;

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Stepper tabs - hidden during fullscreen video */}
      <div className={`bg-slate-900/95 border-b border-slate-700/40 px-4 py-2.5 ${hideStepperTabs ? "hidden" : ""}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onBack}
            title="Voltar para a lista de aulas"
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/40 text-slate-200 hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
            <span className="text-xs font-medium">Voltar</span>
          </button>
          <h2
            className="text-slate-200 font-semibold text-sm mr-2 truncate max-w-xs"
            title={lessonGroup.title}
          >
            {lessonGroup.title}
          </h2>
          <div className="w-px h-5 bg-slate-700/50 mr-1" />
          {availableSteps.map((step) => (
            <StepTab
              key={step.key}
              step={step}
              isActive={activeStep === step.key}
              isCompleted={isStepCompleted(step.key)}
              onClick={() => setActiveStep(step.key)}
            />
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setAiModalOpen(true)}
              title="Gerar resumo/quiz/flashcards/diario com IA (DeepSeek)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Gerar IA
            </button>
            <div className="flex items-center gap-1.5">
              {availableSteps.map((step) => (
                <div
                  key={step.key}
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                    isStepCompleted(step.key) ? "bg-emerald-400" : "bg-slate-700"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-slate-500 tabular-nums ml-1">
              {completedCount}/{availableSteps.length}
            </span>
            {allComplete && (
              <CheckCircle className="w-4 h-4 text-emerald-400 animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* Active content */}
      <div className="flex-1 overflow-hidden">{renderActiveContent()}</div>

      <AIGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        courseTitle={courseTitle}
        lessonPrefix={lessonGroup.prefix}
        onGenerated={() => {
          setTimeout(() => window.location.reload(), 800);
        }}
      />
    </div>
  );
};

// Header pequeno do step. O "Voltar" global mora no topo do stepper —
// aqui só o titulo do step + botao de marcar como concluido.
const StepHeader = ({ title, stepKey, isCompleted, onMarkComplete }) => (
  <div className="bg-slate-800/80 py-2 px-4 border-b border-slate-700/40 flex items-center justify-between">
    <h3 className="text-slate-200 font-medium text-sm">{title}</h3>
    <button
      onClick={() => onMarkComplete(stepKey)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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

export default LessonStepper;
