// useWatchTimer: rastreia tempo REAL assistido de um video.
//
// Estrategia: ouve `timeupdate` do <video> e acumula apenas pequenas
// diferencas consecutivas de currentTime. Diferencas grandes (>2s) sao
// ignoradas — eh seek, nao watch. Pausa eh implicita (sem timeupdate).
// Isso da uma medida bem proxima do "playback wall-time" sem precisar
// rastrear play/pause manualmente.
//
// O total acumulado eh enviado on-unmount via saveViewSession (que
// internamente usa sendBeacon pra sobreviver a fechar a aba).

import { useEffect, useRef } from "react";
import { saveViewSession } from "../utils/progressApi";

const MAX_TIMEUPDATE_DIFF = 2; // s — alem disso eh seek

export const useWatchTimer = (videoRef, courseTitle, lessonPrefix) => {
  const accumulatedRef = useRef(0); // segundos efetivamente assistidos
  const lastTimeRef = useRef(null);
  const sentRef = useRef(false);

  useEffect(() => {
    if (!videoRef?.current || !courseTitle || !lessonPrefix) return;
    const video = videoRef.current;

    // Reset ao trocar de aula
    accumulatedRef.current = 0;
    lastTimeRef.current = null;
    sentRef.current = false;

    const onTimeUpdate = () => {
      const now = video.currentTime;
      const last = lastTimeRef.current;
      if (last != null) {
        const diff = now - last;
        // diff > 0 e < MAX: avanco normal de playback
        // diff <= 0 ou > MAX: seek/replay/erro — descarta
        if (diff > 0 && diff < MAX_TIMEUPDATE_DIFF) {
          accumulatedRef.current += diff;
        }
      }
      lastTimeRef.current = now;
    };

    const onSeeking = () => {
      // Reset do referencial pra nao contar o salto como playback
      lastTimeRef.current = null;
    };

    const send = () => {
      if (sentRef.current) return;
      const seconds = Math.floor(accumulatedRef.current);
      if (seconds >= 5) {
        sentRef.current = true;
        saveViewSession({ courseTitle, lessonPrefix, kind: "video", seconds });
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);
    window.addEventListener("pagehide", send);
    window.addEventListener("beforeunload", send);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeking", onSeeking);
      window.removeEventListener("pagehide", send);
      window.removeEventListener("beforeunload", send);
      send();
    };
  }, [videoRef, courseTitle, lessonPrefix]);
};
