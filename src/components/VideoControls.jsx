import React from "react";
import {
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
} from "lucide-react";
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

const VolumeIcon = ({ volume }) => {
  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return <Icon className="w-4 h-4 text-white" />;
};

const FullscreenIcon = ({ isFullscreen }) => {
  const Icon = isFullscreen ? Minimize : Maximize;
  return <Icon className="w-4 h-4 text-white" />;
};

const SettingsIcon = () => <Settings className="w-4 h-4 text-white" />;

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
          <div className="group relative flex items-center">
             <button className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs text-white/90 transition-colors">
               <SettingsIcon />
               <span>Auto</span>
             </button>
             <div className="absolute bottom-full right-0 mb-2 w-32 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 p-1">
                <div className="px-2 py-1.5 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Qualidade</div>
                <button className="w-full text-left px-2 py-1.5 text-xs text-blue-400 bg-blue-500/10 rounded flex items-center justify-between">
                  <span>Auto (Original)</span>
                  <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                </button>
                <div className="mt-1 px-2 py-1.5 text-[9px] text-slate-400 leading-tight border-t border-slate-800">
                  O Drive serve apenas a qualidade original via stream direto.
                </div>
             </div>
          </div>

          <div className="flex items-center space-x-1">
            {[1, 1.25, 1.5, 1.75, 2].map((rate) => (
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
