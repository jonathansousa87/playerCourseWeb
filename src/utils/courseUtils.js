export const flattenCourseContent = (content) => {
  return content.reduce((acc, item) => {
    if (item.type === "lesson" || item.type === "lesson-group") {
      acc.push(item);
    } else if (item.type === "module" && item.content) {
      acc.push(...flattenCourseContent(item.content));
    }
    return acc;
  }, []);
};

export const findNextLesson = (content, currentPath) => {
  const allLessons = flattenCourseContent(content);
  const currentIndex = allLessons.findIndex(
    (lesson) => lesson.path === currentPath
  );
  return currentIndex < allLessons.length - 1
    ? allLessons[currentIndex + 1]
    : null;
};

export const findPreviousLesson = (content, currentPath) => {
  const allLessons = flattenCourseContent(content);
  const currentIndex = allLessons.findIndex(
    (lesson) => lesson.path === currentPath
  );
  return currentIndex > 0 ? allLessons[currentIndex - 1] : null;
};

export const countLessons = (content) => {
  return content.reduce((count, item) => {
    if (item.type === "lesson" || item.type === "lesson-group") return count + 1;
    if (item.type === "module" && item.content)
      return count + countLessons(item.content);
    return count;
  }, 0);
};

export const countCompletedLessons = (content, courseProgress, completedSteps) => {
  return content.reduce((count, item) => {
    if (item.type === "lesson") {
      return count + (courseProgress[item.path] ? 1 : 0);
    }
    if (item.type === "lesson-group") {
      if (courseProgress[item.path]) return count + 1;
      if (completedSteps) {
        const stepKeys = [...Object.keys(item.materials || {}), "pessoal"];
        const allDone = stepKeys.length > 0 && stepKeys.every(
          (k) => completedSteps[`${item.prefix}__${k}`]
        );
        return count + (allDone ? 1 : 0);
      }
      return count;
    }
    if (item.type === "module" && item.content) {
      return count + countCompletedLessons(item.content, courseProgress, completedSteps);
    }
    return count;
  }, 0);
};

export const isModuleComplete = (moduleContent, courseTitle, completedLessons, completedSteps) => {
  if (!moduleContent || !Array.isArray(moduleContent)) return false;

  return moduleContent.every((item) => {
    if (item.type === "lesson") {
      return completedLessons[courseTitle]?.[item.path] || false;
    } else if (item.type === "lesson-group") {
      if (completedSteps) {
        const stepKeys = [...Object.keys(item.materials || {}), "pessoal"];
        return stepKeys.length > 0 && stepKeys.every(
          (k) => completedSteps[`${item.prefix}__${k}`]
        );
      }
      return completedLessons[courseTitle]?.[item.path] || false;
    } else if (item.type === "module") {
      return isModuleComplete(item.content, courseTitle, completedLessons, completedSteps);
    }
    return false;
  });
};

export const moduleContainsLesson = (moduleContent, lessonPath) => {
  return moduleContent.some((item) => {
    if (item.type === "lesson" || item.type === "lesson-group")
      return item.path === lessonPath;
    if (item.type === "module")
      return moduleContainsLesson(item.content, lessonPath);
    return false;
  });
};

export const calculateModuleDuration = (moduleContent, videoDurations) => {
  if (!moduleContent || !Array.isArray(moduleContent))
    return { duration: 0, videoCount: 0 };

  return moduleContent.reduce(
    (acc, item) => {
      if (
        item.type === "lesson" &&
        item.title &&
        /\.(mp4|webm|ts|m3u8|mkv)$/i.test(item.title)
      ) {
        const duration = videoDurations[item.path] || 0;
        const validDuration =
          isFinite(duration) && !isNaN(duration) && duration > 0 ? duration : 0;
        return {
          duration: acc.duration + validDuration,
          videoCount: acc.videoCount + (validDuration > 0 ? 1 : 0),
        };
      } else if (item.type === "lesson-group" && item.materials?.video) {
        const videoPath = item.materials.video.path;
        const duration = videoDurations[videoPath] || 0;
        const validDuration =
          isFinite(duration) && !isNaN(duration) && duration > 0 ? duration : 0;
        return {
          duration: acc.duration + validDuration,
          videoCount: acc.videoCount + (validDuration > 0 ? 1 : 0),
        };
      } else if (item.type === "module" && item.content) {
        const sub = calculateModuleDuration(item.content, videoDurations);
        return {
          duration: acc.duration + sub.duration,
          videoCount: acc.videoCount + sub.videoCount,
        };
      }
      return acc;
    },
    { duration: 0, videoCount: 0 }
  );
};

// Conta quantos modulos (nivel raiz) tem acerto medio < 60% com base no mapa
// `lessonAccuracy` (lessonPrefix -> { total, correct, accuracy, lastReview }).
// Usado pro banner de "revisar antes de continuar".
export const countWeakModules = (content, accuracyMap, threshold = 0.6) => {
  if (!content || !accuracyMap || accuracyMap.size === 0) return 0;

  const aggregateModule = (items) => {
    let total = 0;
    let correct = 0;
    const walk = (list) => {
      for (const item of list) {
        if (item.type === "lesson-group" && item.prefix) {
          const row = accuracyMap.get(item.prefix);
          if (row && row.total > 0) {
            total += row.total;
            correct += row.correct;
          }
        } else if (item.type === "module" && item.content) {
          walk(item.content);
        }
      }
    };
    walk(items);
    return total > 0 ? correct / total : null;
  };

  return content.reduce((count, item) => {
    if (item.type !== "module") return count;
    const acc = aggregateModule(item.content || []);
    return count + (acc != null && acc < threshold ? 1 : 0);
  }, 0);
};

export const processCourseStructure = (course) => {
  if (!course.content) return;

  const moduleMap = new Map();

  course.content.forEach((item) => {
    if ((item.type === "lesson" || item.type === "lesson-group") && item.path) {
      const pathParts = item.path.split("/");
      if (pathParts.length > 2) {
        let currentPath = pathParts[0];
        for (let i = 1; i < pathParts.length - 1; i++) {
          currentPath += "/" + pathParts[i];
          if (!moduleMap.has(currentPath)) {
            moduleMap.set(currentPath, {
              type: "module",
              title: pathParts[i],
              path: currentPath,
              content: [],
            });
          }
        }
      }
    }
  });

  const rootContent = [];

  course.content.forEach((item) => {
    if ((item.type === "lesson" || item.type === "lesson-group") && item.path) {
      const pathParts = item.path.split("/");
      if (pathParts.length <= 2) {
        rootContent.push(item);
      } else {
        const parentPath = pathParts.slice(0, -1).join("/");
        const parentModule = moduleMap.get(parentPath);
        if (parentModule) {
          parentModule.content.push(item);
        }
      }
    } else if (item.type === "module") {
      rootContent.push(item);
    }
  });

  moduleMap.forEach((module, path) => {
    const pathParts = path.split("/");
    if (pathParts.length === 2) {
      rootContent.push(module);
    }
  });

  moduleMap.forEach((module, path) => {
    const pathParts = path.split("/");
    if (pathParts.length > 2) {
      const parentPath = pathParts.slice(0, -1).join("/");
      const parentModule = moduleMap.get(parentPath);
      if (parentModule && !parentModule.content.includes(module)) {
        parentModule.content.push(module);
      }
    }
  });

  course.content = rootContent;
};
