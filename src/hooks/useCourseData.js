import { useState, useEffect, useCallback } from "react";
import { processCourseStructure } from "../utils/courseUtils";
import { getMediaUrl } from "../utils/fileUtils";
import { DEFAULT_COURSES_PATH } from "../config";

const useCourseData = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coursesPath, setCoursesPath] = useState(DEFAULT_COURSES_PATH);
  const [videoDurations, setVideoDurations] = useState({});
  const [loadingVideos, setLoadingVideos] = useState(new Set());

  const reloadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/courses");
      const courseData = await response.json();

      courseData.forEach((course) => {
        processCourseStructure(course);
      });

      setCourses(courseData);

      try {
        const durationsResponse = await fetch("/api/video-durations");
        const cachedDurations = await durationsResponse.json();
        setVideoDurations(cachedDurations);
      } catch (error) {
        console.error("Erro ao carregar cache de durações:", error);
      }

      setLoading(false);
    } catch (error) {
      console.error("Erro ao carregar cursos:", error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadCoursesPath = async () => {
      try {
        const response = await fetch("/api/config/courses-path");
        const data = await response.json();
        setCoursesPath(data.path);
      } catch (error) {
        console.error("Erro ao carregar caminho dos cursos:", error);
      }
    };

    loadCoursesPath();
    reloadCourses();
  }, [reloadCourses]);

  const loadVideoDuration = async (videoPath, courseTitle) => {
    if (videoDurations[videoPath] !== undefined || loadingVideos.has(videoPath)) {
      return;
    }

    setLoadingVideos((prev) => new Set(prev).add(videoPath));

    try {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = getMediaUrl(courseTitle, videoPath);

      await new Promise((resolve) => {
        const cleanup = () => {
          video.removeEventListener("loadedmetadata", onLoad);
          video.removeEventListener("error", onError);
          video.src = "";
        };

        const onLoad = async () => {
          const dur = video.duration || 0;
          setVideoDurations((prev) => ({ ...prev, [videoPath]: dur }));

          try {
            await fetch(
              `/api/video-durations/${encodeURIComponent(
                videoPath
              )}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ duration: dur }),
              }
            );
          } catch (error) {
            console.error("Erro ao salvar duração no cache:", error);
          }

          cleanup();
          resolve();
        };

        const onError = () => {
          setVideoDurations((prev) => ({
            ...prev,
            [videoPath]: prev[videoPath] !== undefined ? prev[videoPath] : 0,
          }));
          cleanup();
          resolve();
        };

        setTimeout(() => {
          if (video.readyState === 0) onError();
        }, 5000);

        video.addEventListener("loadedmetadata", onLoad);
        video.addEventListener("error", onError);
      });
    } catch {
      setVideoDurations((prev) => ({
        ...prev,
        [videoPath]: prev[videoPath] !== undefined ? prev[videoPath] : 0,
      }));
    } finally {
      setLoadingVideos((prev) => {
        const newSet = new Set(prev);
        newSet.delete(videoPath);
        return newSet;
      });
    }
  };

  const saveCoursesPath = async (newPath) => {
    try {
      const response = await fetch(
        "/api/config/courses-path",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: newPath }),
        }
      );

      if (response.ok) {
        setCoursesPath(newPath);
        await reloadCourses();
      } else {
        alert("Erro ao salvar configuração");
      }
    } catch (error) {
      console.error("Erro ao salvar caminho dos cursos:", error);
      alert("Erro ao salvar configuração");
    }
  };

  return {
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
  };
};

export default useCourseData;
