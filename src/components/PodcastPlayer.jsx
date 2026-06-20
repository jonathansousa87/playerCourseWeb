import React, { useEffect, useState } from "react";
import { Mic, GraduationCap } from "lucide-react";
import { getMediaUrl } from "../utils/fileUtils";
import { LoadingState } from "./StateViews";

// Renderiza o podcast da aula: player de audio + roteiro do dialogo.
// `fileUrl` aponta pro /api/materials/.../podcast, que devolve o JSON
// { audio, title, turns:[{speaker,text}] } como texto.
const PodcastPlayer = ({ fileUrl, courseTitle }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileUrl) return;
    setLoading(true);
    setError(null);
    fetch(fileUrl)
      .then((res) => res.text())
      .then((text) => {
        setData(JSON.parse(text));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar podcast:", err);
        setError("Nao foi possivel carregar o podcast.");
        setLoading(false);
      });
  }, [fileUrl]);

  if (loading) return <LoadingState message="Carregando podcast..." />;
  if (error) return <div className="p-8 text-center text-red-300">{error}</div>;
  if (!data) return null;

  const audioSrc = getMediaUrl(courseTitle, data.audio);

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="w-full max-w-3xl mx-auto px-4 lg:px-8 py-8">
        <div className="bg-gradient-to-r from-blue-600/15 to-indigo-600/15 border border-blue-500/20 rounded-2xl px-6 py-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/15 text-blue-300">
              <Mic className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-100">{data.title || "Podcast da aula"}</h1>
          </div>
          <audio controls src={audioSrc} className="w-full">
            Seu navegador nao suporta audio.
          </audio>
        </div>

        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Roteiro</h2>
        <div className="space-y-3">
          {(data.turns || []).map((t, i) => {
            const isSenior = t.speaker === "senior";
            const name = isSenior
              ? data.names?.senior || "Luiz"
              : data.names?.junior || "Daniela";
            return (
              <div
                key={i}
                className={`flex gap-3 ${isSenior ? "" : "flex-row-reverse text-right"}`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isSenior
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                  title={name}
                >
                  {isSenior ? <GraduationCap className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </div>
                <div className="max-w-[80%]">
                  <div
                    className={`text-[11px] font-semibold mb-0.5 ${
                      isSenior ? "text-emerald-300" : "text-amber-300"
                    }`}
                  >
                    {name}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed text-left ${
                      isSenior
                        ? "bg-slate-900/70 border border-emerald-500/15 text-slate-200"
                        : "bg-slate-900/70 border border-amber-500/15 text-slate-200"
                    }`}
                  >
                    {t.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PodcastPlayer;
