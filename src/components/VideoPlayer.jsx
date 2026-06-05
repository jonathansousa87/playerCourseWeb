import React, { useEffect } from "react";
import VideoControls from "./VideoControls";
import CourseSidebar from "./CourseSidebar";
import { useWatchTimer } from "../hooks/useWatchTimer";
import { Z_INDEX } from "../utils/zIndex";

const FullscreenSidebar = ({
  sidebarPosition,
  sidebarHovered,
  sidebarLocked,
  onSidebarHover,
  onSidebarLeave,
  onTogglePosition,
}) => (
  <>
    <div
      className={`absolute ${sidebarPosition === "right" ? "right-0" : "left-0"} top-0 w-8 h-full z-40`}
      onMouseEnter={onSidebarHover}
      onMouseLeave={onSidebarLeave}
    >
      <div className={`absolute ${sidebarPosition === "right" ? "right-0 rounded-l-full" : "left-0 rounded-r-full"} top-1/2 transform -translate-y-1/2 w-1 h-16 bg-blue-500/50`}></div>
    </div>
    <div
      className={`absolute ${sidebarPosition === "right" ? "right-0" : "left-0"} w-[min(28rem,90vw)] bg-slate-950/95 backdrop-blur-md transform transition-transform duration-300 ease-in-out`}
      style={{
        height: "100vh",
        top: "0",
        zIndex: Z_INDEX.fullscreenOverlay,
        transform: `${sidebarHovered || sidebarLocked ? "translateX(0)" : sidebarPosition === "right" ? "translateX(100%)" : "translateX(-100%)"}`,
      }}
      onMouseEnter={onSidebarHover}
      onMouseLeave={() => !sidebarLocked && onSidebarLeave()}
    >
      <CourseSidebar sidebarPosition={sidebarPosition} onTogglePosition={onTogglePosition} />
    </div>
  </>
);

const FullscreenTopControls = ({ title, showTopControls, onSetShowTopControls }) => (
  <div
    className={`absolute top-0 left-0 w-full h-20 z-50 transition-all duration-300 ${showTopControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full"}`}
    onMouseEnter={() => onSetShowTopControls(true)}
    onMouseLeave={() => onSetShowTopControls(false)}
  >
    <div className="bg-gradient-to-b from-black/80 to-transparent px-6 py-4 h-full flex items-center">
      <h2 className="text-white text-lg font-semibold">{title}</h2>
    </div>
  </div>
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
  onToggleSidebarPosition,
  onTimeUpdate,
  onEnded,
  onSetupListeners,
  onInternalTimeUpdate,
  courseTitle,
  lessonPrefix,
}) => {
  useWatchTimer(videoRef, courseTitle, lessonPrefix);

  useEffect(() => {
    if (onSetupListeners && videoRef.current) {
      return onSetupListeners(selectedLesson);
    }
  }, [onSetupListeners, selectedLesson, fileUrl]);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    const apply = () => { video.playbackRate = playbackRate; };
    apply();
    video.addEventListener("loadedmetadata", apply);
    video.addEventListener("loadeddata", apply);
    return () => {
      video.removeEventListener("loadedmetadata", apply);
      video.removeEventListener("loadeddata", apply);
    };
  }, [videoRef, playbackRate, fileUrl]);

  return (
  <div className="w-full min-h-full flex flex-col items-center justify-center py-4 px-2 sm:px-4 lg:px-8 bg-slate-900/10">
    <div
      ref={videoContainerRef}
      className={`relative bg-black group video-container overflow-hidden shadow-2xl transition-all duration-300 ${
        isFullscreen
          ? "w-screen h-screen"
          : "w-full max-w-[min(1600px,calc((100vh_-_8rem)*16/9))] aspect-video rounded-xl border border-slate-700/50"
      }`}
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
        crossOrigin="use-credentials"
        onClick={onVideoClick}
        onTimeUpdate={(e) => {
          if (onTimeUpdate) onTimeUpdate(e);
          if (onInternalTimeUpdate) onInternalTimeUpdate(e);
        }}
        onEnded={onEnded}
        onError={(e) => {
          const v = e.target;
          const err = v.error;
          console.error('[Video Error]', {
            code: err?.code,
            message: err?.message,
            networkState: v.networkState,
            readyState: v.readyState,
            currentSrc: v.currentSrc?.slice(0, 120),
          });
        }}
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
            onTogglePosition={onToggleSidebarPosition}
          />
        </>
      )}
    </div>
  </div>
  );
};

export default VideoPlayer;
