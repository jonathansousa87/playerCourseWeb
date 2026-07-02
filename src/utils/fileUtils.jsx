import React from "react";
import { MonitorPlay, FileText, FileCode } from "lucide-react";
import { getCurrentAccessToken } from "../lib/supabase";

export const isVideoFile = (filename) =>
  /\.(mp4|webm|ts|m3u8|mkv)$/i.test(filename);

export const isPDFFile = (filename) => filename.endsWith(".pdf");

export const isHTMLFile = (filename) => filename.endsWith(".html");

export const getFileIcon = (filename) => {
  if (isVideoFile(filename)) {
    return <MonitorPlay className="w-5 h-5 mr-2 text-blue-500" />;
  } else if (isPDFFile(filename)) {
    return <FileText className="w-5 h-5 mr-2 text-red-500" />;
  } else if (isHTMLFile(filename)) {
    return <FileCode className="w-5 h-5 mr-2 text-purple-500" />;
  }
  return <FileText className="w-5 h-5 mr-2 text-gray-500" />;
};

export const formatTime = (seconds) => {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "00:00:00";

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export const getMediaUrl = (courseTitle, filePath) => {
  if (!filePath) return "";
  // filePath pode ter subpastas de modulo (ex: "01 Modulo(...)/aula.mp3").
  // encodeURIComponent no path INTEIRO transformaria a "/" real em "%2F",
  // gerando uma URL que parece corrompida (mesmo que o Express decodifique
  // de volta corretamente por causa do "(*)" na rota). Encoda por segmento
  // e junta com "/" literal, preservando a estrutura de pastas.
  const encodedPath = String(filePath)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const base = `/cursos/${encodeURIComponent(courseTitle)}/${encodedPath}`;
  const token = getCurrentAccessToken();
  return token ? `${base}?t=${encodeURIComponent(token)}` : base;
};
