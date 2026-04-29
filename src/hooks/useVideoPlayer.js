import { useState, useRef, useEffect, useCallback } from "react";

const useVideoPlayer = () => {
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef(null);
  const videoRef = useRef(null);
  const playbackRateRef = useRef(1);

  useEffect(() => {
    const savedRate = localStorage.getItem("preferredPlaybackRate");
    if (savedRate) {
      const rate = parseFloat(savedRate);
      setPlaybackRate(rate);
      playbackRateRef.current = rate;
    }
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    };
  }, []);

  const applyPlaybackRate = useCallback(
    (videoElement) => {
      if (videoElement) videoElement.playbackRate = playbackRateRef.current;
    },
    []
  );

  const changePlaybackRate = useCallback((rate) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
    localStorage.setItem("preferredPlaybackRate", rate);
  }, []);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    }
  }, []);

  const handleVideoClick = useCallback(
    (onToggleFullscreen) => {
      clickCountRef.current += 1;

      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);

      if (clickCountRef.current === 2) {
        onToggleFullscreen();
        clickCountRef.current = 0;
        clickTimeoutRef.current = null;
      } else {
        clickTimeoutRef.current = setTimeout(() => {
          togglePlayPause();
          clickCountRef.current = 0;
          clickTimeoutRef.current = null;
        }, 300);
      }
    },
    [togglePlayPause]
  );

  const handleTimelineClick = useCallback(
    (e) => {
      const video = videoRef.current;
      const timeline = e.currentTarget;
      const rect = timeline.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const newTime = percent * duration;

      if (video && duration) {
        video.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration]
  );

  const handleTimelineDrag = useCallback(
    (e) => {
      if (!isDragging) return;
      const timeline = e.currentTarget;
      const rect = timeline.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const newTime = percent * duration;

      if (videoRef.current && duration) {
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [isDragging, duration]
  );

  const changeVolume = useCallback((newVolume) => {
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  }, []);

  const seekRelative = useCallback(
    (seconds) => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = Math.max(
          0,
          Math.min(duration, video.currentTime + seconds)
        );
      }
    },
    [duration]
  );

  const setupVideoListeners = useCallback(
    (selectedLesson) => {
      const video = videoRef.current;
      if (!video || !selectedLesson) return;

      // Reset time states for the new video
      setCurrentTime(0);
      setDuration(0);

      const updateTime = () => {
        if (!isDragging) setCurrentTime(video.currentTime);
      };
      const updateDuration = () => {
        setDuration(video.duration);
        applyPlaybackRate(video);
      };
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleVolumeChange = () => setVolume(video.volume);

      const handleCanPlay = () => applyPlaybackRate(video);

      video.addEventListener("timeupdate", updateTime);
      video.addEventListener("loadedmetadata", updateDuration);
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("volumechange", handleVolumeChange);

      // If metadata is already loaded (e.g. cached), grab duration immediately
      if (video.readyState >= 1 && video.duration) {
        setDuration(video.duration);
        setCurrentTime(video.currentTime);
      }

      video.play().catch((error) => {
        console.log("Autoplay foi impedido:", error);
      });
      applyPlaybackRate(video);

      return () => {
        video.removeEventListener("timeupdate", updateTime);
        video.removeEventListener("loadedmetadata", updateDuration);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("volumechange", handleVolumeChange);
      };
    },
    [isDragging, applyPlaybackRate]
  );

  return {
    videoRef,
    playbackRate,
    isPlaying,
    currentTime,
    duration,
    volume,
    isDragging,
    setIsDragging,
    changePlaybackRate,
    togglePlayPause,
    handleVideoClick,
    handleTimelineClick,
    handleTimelineDrag,
    changeVolume,
    seekRelative,
    setupVideoListeners,
    setCurrentTime,
  };
};

export default useVideoPlayer;
