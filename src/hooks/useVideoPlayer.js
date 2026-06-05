import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const useVideoPlayer = () => {
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef(null);
  const isDraggingRef = useRef(false);
  const videoRef = useRef(null);
  const playbackRateRef = useRef(1);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    // Cache local primeiro pra resposta sincrona; depois sobrescreve com a do Supabase
    const cached = localStorage.getItem("preferredPlaybackRate");
    if (cached) {
      const rate = parseFloat(cached);
      setPlaybackRate(rate);
      playbackRateRef.current = rate;
    }
    // user_settings.video_playback_rate e o source of truth (compartilhado com mobile)
    supabase.from("user_settings").select("settings").maybeSingle()
      .then(({ data }) => {
        const remote = parseFloat(data?.settings?.video_playback_rate);
        if (remote && remote > 0 && remote !== playbackRateRef.current) {
          setPlaybackRate(remote);
          playbackRateRef.current = remote;
          localStorage.setItem("preferredPlaybackRate", String(remote));
        }
      })
      .catch(() => {});
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

  const changePlaybackRate = useCallback(async (rate) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
    localStorage.setItem("preferredPlaybackRate", String(rate));
    // Persiste no Supabase pra sincronizar com mobile
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (!userId) return;
      const { data: cur } = await supabase.from("user_settings")
        .select("settings").eq("user_id", userId).maybeSingle();
      const merged = { ...(cur?.settings ?? {}), video_playback_rate: rate };
      await supabase.from("user_settings").upsert({
        user_id: userId, settings: merged, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    } catch {}
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

  const handleTimeUpdate = useCallback((e) => {
    const video = e.target;
    if (!isDraggingRef.current && video) {
      setCurrentTime(video.currentTime);
    }
  }, []);

  const setupVideoListeners = useCallback(
    (selectedLesson) => {
      const video = videoRef.current;
      if (!video || !selectedLesson) return;

      const updateDuration = () => {
        setDuration(video.duration);
        applyPlaybackRate(video);
      };
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleVolumeChange = () => setVolume(video.volume);
      const handleCanPlay = () => applyPlaybackRate(video);

      video.addEventListener("loadedmetadata", updateDuration);
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("volumechange", handleVolumeChange);

      if (video.readyState >= 1) {
        if (video.duration) setDuration(video.duration);
        setCurrentTime(video.currentTime);
        if (!video.paused) setIsPlaying(true);
      }

      applyPlaybackRate(video);

      return () => {
        video.removeEventListener("loadedmetadata", updateDuration);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("volumechange", handleVolumeChange);
      };
    },
    [applyPlaybackRate]
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
    handleTimeUpdate,
    changeVolume,
    seekRelative,
    setupVideoListeners,
    setCurrentTime,
  };
};

export default useVideoPlayer;
