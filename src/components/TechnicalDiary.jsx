import React, { useEffect, useRef, useState } from "react";
import { Save, CheckCircle } from "lucide-react";
import {
  fetchTechnicalDiary,
  saveTechnicalDiary,
} from "../utils/progressApi";

const TechnicalDiary = ({
  courseTitle,
  lessonPrefix,
  templateUrl,
  onMarkComplete,
  isCompleted,
}) => {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    if (!courseTitle || !lessonPrefix) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchTechnicalDiary(courseTitle, lessonPrefix);
        if (cancelled) return;
        if (data?.content) {
          setContent(data.content);
        } else if (templateUrl) {
          const res = await fetch(templateUrl);
          const template = res.ok ? await res.text() : "";
          if (!cancelled) setContent(template);
        }
      } catch (err) {
        console.error("Erro ao carregar diario tecnico:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseTitle, lessonPrefix, templateUrl]);

  useEffect(() => {
    if (loading) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (content.trim()) handleSave(true);
    }, 2000);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (silent = false) => {
    if (!content.trim()) return;
    if (!silent) setSaving(true);
    try {
      await saveTechnicalDiary(courseTitle, lessonPrefix, content);
      if (!silent) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Erro ao salvar diario tecnico:", err);
    }
    if (!silent) setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Carregando...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="max-w-3xl w-full mx-auto flex flex-col flex-1 px-10 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-1">Diario Tecnico</h2>
          <p className="text-slate-500 text-sm">
            Registre decisoes, bloqueios, o que aprendeu e o que faria diferente. Markdown permitido.
          </p>
        </div>

        <div className="flex-1 min-h-0">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSaved(false);
            }}
            className="w-full h-full bg-slate-800/60 border border-slate-700/40 rounded-xl px-6 py-5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 resize-none text-sm leading-[1.8] font-mono"
          />
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-slate-500">
            {content.length > 0 ? `${content.split(/\s+/).filter(Boolean).length} palavras` : "Diario vazio"}
            {saved && <span className="ml-2 text-emerald-400">Salvo automaticamente</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving || !content.trim()}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                saved
                  ? "bg-emerald-600/80 text-white"
                  : "bg-blue-600/80 hover:bg-blue-500/80 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              {saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
            </button>
            <button
              onClick={() => onMarkComplete("diario")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                isCompleted
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                  : "bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border border-slate-600/30"
              }`}
            >
              {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-current inline-block" />}
              {isCompleted ? "Concluido" : "Concluir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalDiary;
