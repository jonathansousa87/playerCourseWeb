// useReadTimer: rastreia tempo de leitura/consumo passivo (resumo, exemplos)
// e POSTA a sessao quando o componente desmonta ou a aba sai.
//
// Tempo eh medido entre mount e unmount, com pausa quando a aba esta
// invisivel (tab background nao deve contar). Usa Date.now() simples —
// nao precisa ser milissegundo-precise pro nosso uso (estimativa).
//
// O backend descarta sessions com seconds < 5, entao abrir e fechar
// imediato nao polui o DB.

import { useEffect, useRef } from "react";
import { saveViewSession } from "../utils/progressApi";

export const useReadTimer = (courseTitle, lessonPrefix, kind) => {
  const startedAtRef = useRef(null);
  const accumulatedRef = useRef(0); // segundos acumulados antes da ultima pausa
  const sentRef = useRef(false);

  useEffect(() => {
    if (!courseTitle || !lessonPrefix || !kind) return;

    // Reset ao trocar de aula/kind
    startedAtRef.current = Date.now();
    accumulatedRef.current = 0;
    sentRef.current = false;

    const flushElapsed = () => {
      if (startedAtRef.current != null) {
        accumulatedRef.current += (Date.now() - startedAtRef.current) / 1000;
        startedAtRef.current = null;
      }
    };

    const resume = () => {
      if (startedAtRef.current == null) {
        startedAtRef.current = Date.now();
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        flushElapsed();
      } else {
        resume();
      }
    };

    const send = () => {
      if (sentRef.current) return;
      flushElapsed();
      const seconds = Math.floor(accumulatedRef.current);
      if (seconds >= 5) {
        sentRef.current = true;
        saveViewSession({ courseTitle, lessonPrefix, kind, seconds });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", send);
    window.addEventListener("beforeunload", send);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", send);
      window.removeEventListener("beforeunload", send);
      send();
    };
  }, [courseTitle, lessonPrefix, kind]);
};
