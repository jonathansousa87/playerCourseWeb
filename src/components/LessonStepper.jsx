import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle, Circle, Sparkles, ArrowLeft, Check, Clock,
  Target, Play, FileText, Coffee, HelpCircle, Repeat, PenLine, Dumbbell, Mic,
} from "lucide-react";
import { getMediaUrl } from "../utils/fileUtils";
import VideoPlayer from "./VideoPlayer";
import MarkdownViewer from "./MarkdownViewer";
import FlashcardViewer from "./FlashcardViewer";
import QuizViewer from "./QuizViewer";
import ExamplesViewer from "./ExamplesViewer";
import PodcastPlayer from "./PodcastPlayer";
import PersonalSummary from "./PersonalSummary";
import PreQuiz from "./PreQuiz";
import AIGenerateModal from "./AIGenerateModal";
import { API_BASE } from "../config";

// "requiresVideo": step depende de transcricao (.txt/.vtt) que so existe
// se a aula tem video. Aparece sempre que materials.video existir.
// "always": step nao depende de arquivos da aula.
const STEP_CONFIG = [
  { key: "prequiz", label: "Pre-Quiz", Icon: Target, requiresTranscript: true },
  { key: "video", label: "Video", Icon: Play },
  { key: "podcast", label: "Podcast", Icon: Mic },
  { key: "resumo", label: "Resumo", Icon: FileText },
  { key: "piada", label: "Pausa", Icon: Coffee },
  { key: "quiz", label: "Quiz", Icon: HelpCircle },
  { key: "flashcards", label: "Flashcards", Icon: Repeat },
  { key: "exemplos", label: "Pratica", Icon: Dumbbell },
  { key: "pessoal", label: "Meu Resumo", Icon: PenLine, always: true },
];

// Nó da linha temporal com ícone de linha (lucide). Ativo e concluído usam a
// MESMA cor (accent do tema); o ativo ganha um anel e o concluído um selo de
// check sobre o ícone do passo. Futuro = apagado.
const TimelineNode = ({ step, isActive, isCompleted, onClick }) => {
  const Icon = step.Icon;
  const accentStyle = isActive || isCompleted;

  const circleStyle = accentStyle
    ? {
        background: "var(--accent-soft)",
        borderColor: "var(--accent)",
        boxShadow: isActive ? "0 0 0 3px var(--accent-soft)" : "none",
      }
    : { background: "var(--surface-2)", borderColor: "var(--border-strong)" };

  const iconColor = accentStyle ? "var(--accent)" : "var(--text-muted)";
  const labelColor = accentStyle ? "var(--accent)" : "var(--text-muted)";

  return (
    <button
      onClick={onClick}
      title={step.label}
      className="flex items-center gap-2 shrink-0 focus:outline-none"
    >
      <span
        className={`relative flex items-center justify-center rounded-full border-2 transition-all duration-200 ${
          isActive ? "w-9 h-9" : "w-8 h-8"
        }`}
        style={circleStyle}
      >
        <Icon className={isActive ? "w-4 h-4" : "w-3.5 h-3.5"} style={{ color: iconColor }} />
        {isCompleted && (
          <span
            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center border"
            style={{ background: "var(--accent)", borderColor: "var(--surface)" }}
          >
            <Check className="w-2.5 h-2.5" strokeWidth={3} style={{ color: "var(--accent-contrast)" }} />
          </span>
        )}
      </span>
      <span
        className="text-xs whitespace-nowrap transition-colors hidden lg:inline"
        style={{ color: labelColor, fontWeight: isActive ? 700 : 500 }}
      >
        {step.label}
      </span>
    </button>
  );
};

const LessonStepper = ({
  lessonGroup,
  courseTitle,
  completedSteps,
  isLessonComplete = false,
  onMarkLessonComplete,
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
  onSetupListeners,
  onInternalTimeUpdate,
  onStepChange = () => {},
  onMaterialsChanged,
}) => {
  const [activeStep, setActiveStep] = useState("video");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const materials = lessonGroup.materials || {};

  // Steps disponiveis:
  // - always: step "pessoal" (sempre)
  // - requiresTranscript: step "prequiz" — precisa de transcricao. Ha transcricao
  //   quando ha video (curso normal) OU quando ha resumo (curso de leitura, que
  //   nasce de um _dub.txt). Antes exigia video e sumia no curso de leitura.
  // - default: precisa do material correspondente
  const availableSteps = STEP_CONFIG.filter((step) => {
    if (step.always) return true;
    if (step.requiresTranscript) return !!(materials.video || materials.resumo);
    return !!materials[step.key];
  });

  // Reset active step when lesson changes. Pre-Quiz vem ANTES do video
  // pra forcar tentativa de recuperacao (Carpenter & Toftness 2017).
  useEffect(() => {
    let step;
    if (materials.video) {
      step = "prequiz";
    } else {
      const first = availableSteps[0];
      step = first ? first.key : "video";
    }
    setActiveStep(step);
    onStepChange(step);
  }, [lessonGroup.prefix]);

  const isStepCompleted = (key) =>
    !!completedSteps[`${lessonGroup.prefix}__${key}`];

  const completedCount = availableSteps.filter((step) =>
    isStepCompleted(step.key)
  ).length;

  const allComplete = completedCount === availableSteps.length;

  // Pipeline completa: avisa o parent (marca a aula) e grava o sentinela
  // 'pipeline_done' — a revisao espacada so aparece pra aulas 100% concluidas.
  useEffect(() => {
    if (allComplete) {
      onAllStepsComplete?.(lessonGroup);
      onStepComplete(`${lessonGroup.prefix}__pipeline_done`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allComplete]);

  const buildFileUrl = (material) => {
    if (!material) return "";
    if (material.path === "__db__") {
      return `${API_BASE}/api/materials/${encodeURIComponent(courseTitle)}/${encodeURIComponent(lessonGroup.prefix)}/${material.kind}`;
    }
    return getMediaUrl(courseTitle, material.path);
  };

  const handleMarkComplete = (stepKey) => {
    onStepComplete(`${lessonGroup.prefix}__${stepKey}`);
  };

  // Conclusao automatica por tempo: so conclui se voce FICAR 1 minuto continuo
  // na etapa, com a aba ATIVA. Trocar de etapa/aula, sair da pagina ou trocar
  // de aba antes de 1 min cancela e zera a contagem (precisa ficar de novo).
  useEffect(() => {
    if (!activeStep || isStepCompleted(activeStep)) return undefined;
    let timer = null;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(() => handleMarkComplete(activeStep), 60_000);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else clearTimeout(timer); // saiu da aba: pausa e zera
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, lessonGroup.prefix]);

  // Advance to next available step
  const advanceToNextStep = useCallback(() => {
    const currentIdx = availableSteps.findIndex((s) => s.key === activeStep);
    if (currentIdx < availableSteps.length - 1) {
      const next = availableSteps[currentIdx + 1].key;
      setActiveStep(next);
      onStepChange(next);
    }
  }, [activeStep, availableSteps, onStepChange]);

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

    // Pre-quiz: nao depende de material em disco — gera via IA on-demand
    if (activeStep === "prequiz") {
      return (
        <PreQuiz
          courseTitle={courseTitle}
          lessonPrefix={lessonGroup.prefix}
          isCompleted={isStepCompleted("prequiz")}
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
            onSetupListeners={onSetupListeners}
            onInternalTimeUpdate={onInternalTimeUpdate}
            courseTitle={courseTitle}
            lessonPrefix={lessonGroup.prefix}
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
              <MarkdownViewer
                fileUrl={fileUrl}
                courseTitle={courseTitle}
                lessonPrefix={lessonGroup.prefix}
              />
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
              <ExamplesViewer
                fileUrl={fileUrl}
                courseTitle={courseTitle}
                lessonPrefix={lessonGroup.prefix}
              />
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

      case "piada":
        return (
          <div className="flex flex-col h-full">
            <StepHeader
              title={
                <>
                  😄 Intervalo Descontraído
                  <span className="ml-2 text-xs text-pink-400 font-normal">piada sobre o assunto da aula</span>
                </>
              }
              stepKey="piada"
              isCompleted={isStepCompleted("piada")}
              onMarkComplete={handleMarkComplete}
              borderClass="border-pink-500/20"
            />
            <div className="flex-1 overflow-hidden">
              <MarkdownViewer
                fileUrl={fileUrl}
                courseTitle={courseTitle}
                lessonPrefix={lessonGroup.prefix}
              />
            </div>
          </div>
        );

      case "podcast":
        return (
          <div className="flex flex-col h-full">
            <StepHeader
              title={
                <>
                  🎙️ Podcast da aula
                  <span className="ml-2 text-xs text-blue-400 font-normal">dev senior x iniciante</span>
                </>
              }
              stepKey="podcast"
              isCompleted={isStepCompleted("podcast")}
              onMarkComplete={handleMarkComplete}
              borderClass="border-blue-500/20"
            />
            <div className="flex-1 overflow-hidden">
              <PodcastPlayer fileUrl={fileUrl} courseTitle={courseTitle} />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const hideStepperTabs = activeStep === "video" && isFullscreen;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg)" }}>
      {/* Stepper tabs - hidden during fullscreen video */}
      <div
        className={`px-4 py-2.5 border-b ${hideStepperTabs ? "hidden" : ""}`}
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            title="Voltar para a lista de aulas"
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border transition-colors flex-shrink-0 hover:bg-[var(--surface-hover)]"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
            <span className="text-xs font-medium">Voltar</span>
          </button>
          <h2
            className="font-semibold text-sm truncate max-w-[8rem] xl:max-w-[12rem] flex-shrink-0"
            style={{ color: "var(--text)" }}
            title={lessonGroup.title}
          >
            {lessonGroup.title}
          </h2>
          <div className="w-px h-5 flex-shrink-0" style={{ background: "var(--border)" }} />

          {/* Linha temporal dos steps — inline, ocupa o meio */}
          <div className="flex items-center flex-1 min-w-0 overflow-x-auto px-1">
            {availableSteps.map((step, i) => (
              <React.Fragment key={step.key}>
                {i > 0 && (
                  <div
                    className="flex-1 h-0.5 min-w-[1.25rem] mx-1.5 rounded-full transition-colors duration-300"
                    style={{
                      background: isStepCompleted(availableSteps[i - 1].key) ? "var(--accent)" : "var(--border-strong)",
                    }}
                  />
                )}
                <TimelineNode
                  step={step}
                  isActive={activeStep === step.key}
                  isCompleted={isStepCompleted(step.key)}
                  onClick={() => { setActiveStep(step.key); onStepChange(step.key); }}
                />
              </React.Fragment>
            ))}
          </div>

          {/* Acoes */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {onMarkLessonComplete && (
              <button
                onClick={onMarkLessonComplete}
                title={
                  isLessonComplete
                    ? "Aula marcada como concluida — clique para desmarcar"
                    : "Marcar a aula inteira como concluida (sem precisar fazer o pre-quiz nem gerar materiais)"
                }
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  isLessonComplete
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border-slate-600/40"
                }`}
              >
                {isLessonComplete ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  <Circle className="w-3.5 h-3.5" />
                )}
                {isLessonComplete ? "Aula concluida" : "Concluir aula"}
              </button>
            )}
            <button
              onClick={() => setAiModalOpen(true)}
              title="Gerar resumo/quiz/flashcards/diario com IA (DeepSeek)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all hover:brightness-110"
              style={{
                background: "var(--accent-soft)",
                borderColor: "var(--accent-soft-strong)",
                color: "var(--accent)",
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Gerar IA
            </button>
            <span className="text-xs tabular-nums ml-1" style={{ color: "var(--text-subtle)" }}>
              {completedCount}/{availableSteps.length}
            </span>
            {allComplete && (
              <CheckCircle className="w-4 h-4 animate-pulse" style={{ color: "var(--accent)" }} />
            )}
          </div>
        </div>
      </div>

      {/* Active content */}
      <div className="flex-1 min-h-0 overflow-y-auto">{renderActiveContent()}</div>

      <AIGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        courseTitle={courseTitle}
        lessonPrefix={lessonGroup.prefix}
        onGenerated={() => {
          onMaterialsChanged?.();
        }}
      />
    </div>
  );
};

// Header pequeno do step. O "Voltar" global mora no topo do stepper —
// aqui só o titulo do step + botao de marcar como concluido. `title` aceita
// texto ou nodes (ex.: titulo com subtitulo) e `borderClass` permite o realce
// de cor por step (ex.: a "pausa" usa borda rosa).
// Sem botao "Concluir": a etapa conclui sozinha apos 1 min nela (ver o timer no
// LessonStepper). Aqui so mostramos o status.
const StepHeader = ({ title, isCompleted, borderClass = "border-slate-700/40" }) => (
  <div className={`bg-slate-800/80 py-2 px-4 border-b ${borderClass} flex items-center justify-between`}>
    <h3 className="text-slate-200 font-medium text-sm">{title}</h3>
    <span
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
        isCompleted ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25" : "text-slate-500"
      }`}
      title={isCompleted ? "Etapa concluida" : "Conclui sozinha apos 1 min nesta etapa"}
    >
      {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
      {isCompleted ? "Concluido" : "Conclui em 1 min"}
    </span>
  </div>
);

export default LessonStepper;
