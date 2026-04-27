import React from "react";
import VideoControls from "./VideoControls";
import CourseSidebar from "./CourseSidebar";

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
  onTimeUpdate,
  onEnded,
}) => (
  <div className="flex flex-col h-full">
    <div
      ref={videoContainerRef}
      className="flex-1 bg-black relative group video-container"
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black cursor-pointer"
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
