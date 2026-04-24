import React from "react";
import { formatTime } from "../utils/fileUtils";

const VideoTimeline = ({
  currentTime,
  duration,
  onTimelineClick,
  onTimelineDrag,
  onDragStart,
  onDragEnd,
}) => (
  <div
    className="custom-timeline mb-4 relative bg-white/20 rounded-full h-2 cursor-pointer hover:h-3 transition-all duration-200 ease-out group"
    onClick={onTimelineClick}
    onMouseDown={onDragStart}
    onMouseUp={onDragEnd}
    onMouseLeave={onDragEnd}
    onMouseMove={onTimelineDrag}
  >
    <div
      className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-75 ease-out shadow-sm"
      style={{
        width:
          duration > 0
            ? `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%`
            : "0%",
        minWidth: currentTime > 0 ? "2px" : "0px",
      }}
    />
    <div
      className="absolute top-1/2 transform -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 border-2 border-blue-400"
      style={{
        left:
          duration > 0
            ? `calc(${Math.min(
                100,
                Math.max(0, (currentTime / duration) * 100)
              )}% - 8px)`
            : "0px",
      }}
    />
  </div>
);

const VolumeIcon = ({ volume }) => (
  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
    {volume === 0 ? (
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    ) : volume < 0.5 ? (
      <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
    ) : (
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    )}
  </svg>
);

const FullscreenIcon = ({ isFullscreen }) => (
  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
    {isFullscreen ? (
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    ) : (
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    )}
  </svg>
);

const VideoControls = ({
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackRate,
  isDragging,
  isFullscreen,
  showBottomControls,
  onTogglePlayPause,
  onTimelineClick,
  onTimelineDrag,
  onDragStart,
  onDragEnd,
  onChangeVolume,
  onChangePlaybackRate,
  onEnterFullscreen,
  onExitFullscreen,
  onSetShowBottomControls,
}) => (
  <>
    {isFullscreen && (
      <div
        className="absolute bottom-0 left-0 w-full h-16 z-40 bg-transparent"
        onMouseEnter={() => onSetShowBottomControls(true)}
        onMouseLeave={() => onSetShowBottomControls(false)}
      />
    )}

    <div
      className={`absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4 transition-all duration-300 ease-in-out z-50 ${
        isFullscreen
          ? showBottomControls
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-full"
          : "opacity-100 translate-y-0"
      }`}
      style={{
        pointerEvents: isFullscreen
          ? showBottomControls
            ? "auto"
            : "none"
          : "auto",
      }}
      onMouseEnter={() => isFullscreen && onSetShowBottomControls(true)}
      onMouseLeave={() => isFullscreen && onSetShowBottomControls(false)}
    >
      <VideoTimeline
        currentTime={currentTime}
        duration={duration}
        isDragging={isDragging}
        onTimelineClick={onTimelineClick}
        onTimelineDrag={onTimelineDrag}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />

      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center space-x-4">
          <button
            onClick={onTogglePlayPause}
            className="player-button flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 hover:scale-105 rounded-full transition-all duration-200 ease-out z-50 relative backdrop-blur-sm"
            title={isPlaying ? "Pausar" : "Reproduzir"}
            style={{ pointerEvents: "auto" }}
          >
            {isPlaying ? (
              <div className="w-6 h-6 flex items-center justify-center">
                <div className="w-1 h-4 bg-white mr-1"></div>
                <div className="w-1 h-4 bg-white"></div>
              </div>
            ) : (
              <div className="w-6 h-6 flex items-center justify-center ml-0.5">
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "8px solid white",
                    borderTop: "6px solid transparent",
                    borderBottom: "6px solid transparent",
                  }}
                ></div>
              </div>
            )}
          </button>

          <div className="text-white text-sm font-medium">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          <div
            className="flex items-center space-x-2"
            title={`Volume: ${Math.round(volume * 100)}%`}
          >
            <VolumeIcon volume={volume} />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-white/20 rounded-lg appearance-none slider"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            {[1, 1.25, 1.5, 1.75].map((rate) => (
              <button
                key={rate}
                onClick={() => onChangePlaybackRate(rate)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  playbackRate === rate
                    ? "bg-blue-500 text-white"
                    : "bg-white/20 hover:bg-white/30 text-white/80"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <button
            onClick={isFullscreen ? onExitFullscreen : onEnterFullscreen}
            className="player-button flex items-center justify-center w-9 h-9 bg-white/20 hover:bg-white/30 hover:scale-110 rounded-lg transition-all duration-200 ease-out backdrop-blur-sm"
            title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
          >
            <FullscreenIcon isFullscreen={isFullscreen} />
          </button>
        </div>
      </div>
    </div>
  </>
);

export default VideoControls;
