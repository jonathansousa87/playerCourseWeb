import React from "react";
import VideoControls from "./VideoControls";
import CourseSidebar from "./CourseSidebar";
import LessonHeader from "./LessonHeader";

const FullscreenSidebar = ({
  sidebarPosition,
  sidebarHovered,
  sidebarLocked,
  onSidebarHover,
  onSidebarLeave,
  onTogglePosition,
}) => {
  return (
    <>
      <div
        className={`absolute ${
          sidebarPosition === "right" ? "right-0" : "left-0"
        } top-0 w-8 h-full z-40`}
        onMouseEnter={onSidebarHover}
        onMouseLeave={onSidebarLeave}
      >
        <div
          className={`absolute ${
            sidebarPosition === "right"
              ? "right-0 rounded-l-full"
              : "left-0 rounded-r-full"
          } top-1/2 transform -translate-y-1/2 w-1 h-16 bg-blue-500/50`}
        ></div>
      </div>

      <div
        className={`absolute ${
          sidebarPosition === "right" ? "right-0" : "left-0"
        } w-[28rem] bg-slate-950/95 backdrop-blur-md transform transition-transform duration-300 ease-in-out`}
        style={{
          height: "100vh",
          top: "0",
          zIndex: 9998,
          transform: `${
            sidebarHovered || sidebarLocked
              ? "translateX(0)"
              : sidebarPosition === "right"
              ? "translateX(100%)"
              : "translateX(-100%)"
          }`,
        }}
        onMouseEnter={onSidebarHover}
        onMouseLeave={() => !sidebarLocked && onSidebarLeave()}
      >
        <CourseSidebar
          sidebarPosition={sidebarPosition}
          onTogglePosition={onTogglePosition}
        />
      </div>
    </>
  );
};

const FullscreenTopControls = ({
  title,
  showTopControls,
  onSetShowTopControls,
}) => (
  <>
    <div
      className="absolute top-0 left-0 w-full h-16 z-40 bg-transparent"
      onMouseEnter={() => onSetShowTopControls(true)}
      onMouseLeave={() => onSetShowTopControls(false)}
    />
    <div
      className={`absolute top-0 left-0 w-full h-20 z-50 transition-all duration-300 ease-in-out ${
        showTopControls
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-full"
      }`}
      style={{ pointerEvents: showTopControls ? "auto" : "none" }}
      onMouseEnter={() => onSetShowTopControls(true)}
      onMouseLeave={() => onSetShowTopControls(false)}
    >
      <div className="bg-gradient-to-b from-black/80 via-black/60 to-transparent px-6 py-4 h-full flex items-center justify-between">
        <div className="flex items-center space-x-4 pointer-events-auto">
          <h2 className="text-white text-lg font-semibold">{title}</h2>
        </div>
      </div>
    </div>
  </>
);

const VideoPlayer = ({
  videoRef,
  videoContainerRef,
  fileUrl,
  selectedLesson,
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
  onTimeUpdate,
  onEnded,
}) => (
  <div className="flex flex-col h-full">
    <LessonHeader title={selectedLesson.title} onBack={onBack}>
      <div className="flex items-center space-x-1">
        {[1, 1.25, 1.5, 1.75].map((rate) => (
          <button
            key={rate}
            onClick={() => onChangePlaybackRate(rate)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              playbackRate === rate
                ? "bg-blue-600/80 text-white"
                : "bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border border-slate-600/30"
            }`}
          >
            {rate}x
          </button>
        ))}
      </div>
      <button
        onClick={isFullscreen ? onExitFullscreen : onEnterFullscreen}
        className="px-2.5 py-1 bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 rounded-lg transition-colors flex items-center text-xs border border-slate-600/30"
        title={isFullscreen ? "Sair da Tela Cheia" : "Entrar em Tela Cheia"}
      >
        <svg
          className="w-4 h-4 mr-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isFullscreen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 9l6 6m0-6l-6 6M21 3v6h-6M3 21v-6h6"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"
            />
          )}
        </svg>
        {isFullscreen ? "Sair" : "Tela Cheia"}
      </button>
    </LessonHeader>

    <div
      ref={videoContainerRef}
      className="flex-1 bg-black relative group video-container"
    >
      <video
        ref={videoRef}
        className="w-full h-full cursor-pointer"
        key={selectedLesson.path}
        controls={false}
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        playsInline
        webkit-playsinline="true"
        x5-playsinline="true"
        onClick={onVideoClick}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        src={fileUrl}
        autoPlay
      />

      <VideoControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        playbackRate={playbackRate}
        isDragging={isDragging}
        isFullscreen={isFullscreen}
        showBottomControls={showBottomControls}
        onTogglePlayPause={onTogglePlayPause}
        onTimelineClick={onTimelineClick}
        onTimelineDrag={onTimelineDrag}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onChangeVolume={onChangeVolume}
        onChangePlaybackRate={onChangePlaybackRate}
        onEnterFullscreen={onEnterFullscreen}
        onExitFullscreen={onExitFullscreen}
        onSetShowBottomControls={onSetShowBottomControls}
      />

      {isFullscreen && (
        <>
          <FullscreenTopControls
            title={selectedLesson.title}
            showTopControls={showTopControls}
            onSetShowTopControls={onSetShowTopControls}
          />
          <FullscreenSidebar
            sidebarPosition={sidebarPosition}
            sidebarHovered={sidebarHovered}
            sidebarLocked={sidebarLocked}
            onSidebarHover={onSidebarHover}
            onSidebarLeave={onSidebarLeave}
            onSidebarLock={onSidebarLock}
            onSidebarUnlock={onSidebarUnlock}
            onTogglePosition={onToggleSidebarPosition}
          />
        </>
      )}
    </div>
  </div>
);

export default VideoPlayer;
