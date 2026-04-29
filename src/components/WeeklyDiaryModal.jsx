import React, { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, BookOpen, Save } from "lucide-react";
import { fetchWeeklyDiaries, saveWeeklyDiary } from "../utils/progressApi";

const getWeekKey = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
};

const formatWeekRange = (weekKey) => {
  const start = new Date(weekKey + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt(start)} — ${fmt(end)}`;
};

const PROMPTS = [
  { key: "learned", label: "O que aprendi esta semana?", placeholder: "Conceitos, técnicas, padrões que ficaram claros..." },
  { key: "decisions", label: "Que decisões técnicas tomei?", placeholder: "Escolhas de arquitetura, ferramentas, abordagens..." },
  { key: "different", label: "O que faria diferente?", placeholder: "Erros, melhorias, insights para o futuro..." },
];

// "ultimo prompt" continua em localStorage — e so uma preferencia de UI local.
const getLastDiaryDate = (courseTitle) =>
  localStorage.getItem(`weeklyDiaryLastPrompt_${courseTitle}`);

const setLastDiaryDate = (courseTitle, date) =>
  localStorage.setItem(`weeklyDiaryLastPrompt_${courseTitle}`, date);

export const shouldShowDiaryPrompt = (courseTitle) => {
  const last = getLastDiaryDate(courseTitle);
  if (!last) return true;
  const lastDate = new Date(last);
  const now = new Date();
  const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
  return diffDays >= 7;
};

export const markDiaryPrompted = (courseTitle) => {
  setLastDiaryDate(courseTitle, new Date().toISOString());
};

const WeeklyDiaryModal = ({ courseTitle, onClose }) => {
  const currentWeek = getWeekKey();
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [diaries, setDiaries] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!courseTitle) return;
    fetchWeeklyDiaries(courseTitle)
      .then((rows) => {
        const map = {};
        for (const r of rows) {
          map[r.week_key] = {
            learned: r.learned || "",
            decisions: r.decisions || "",
            different: r.different || "",
            updatedAt: r.updated_at,
          };
        }
        setDiaries(map);
      })
      .catch((err) => console.error("Erro ao carregar diarios:", err));
  }, [courseTitle]);

  const entry = diaries[selectedWeek] || { learned: "", decisions: "", different: "" };

  // Get sorted week keys for navigation
  const allWeeks = [
    ...new Set([...Object.keys(diaries), currentWeek]),
  ].sort();

  const currentIdx = allWeeks.indexOf(selectedWeek);

  const updateField = (field, value) => {
    const updated = {
      ...diaries,
      [selectedWeek]: { ...entry, [field]: value, updatedAt: new Date().toISOString() },
    };
    setDiaries(updated);
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      await saveWeeklyDiary(courseTitle, selectedWeek, entry);
      markDiaryPrompted(courseTitle);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Erro ao salvar diario:", err);
    }
  };

  const navigateWeek = (direction) => {
    if (direction === -1 && currentIdx > 0) {
      setSelectedWeek(allWeeks[currentIdx - 1]);
    } else if (direction === 1) {
      if (currentIdx < allWeeks.length - 1) {
        setSelectedWeek(allWeeks[currentIdx + 1]);
      } else {
        // Create next week
        const nextDate = new Date(selectedWeek + "T00:00:00");
        nextDate.setDate(nextDate.getDate() + 7);
        const nextKey = getWeekKey(nextDate);
        setSelectedWeek(nextKey);
      }
    }
  };

  const isCurrentWeek = selectedWeek === currentWeek;
  const hasContent = entry.learned || entry.decisions || entry.different;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/40 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">Diário Semanal</h2>
              <p className="text-slate-400 text-xs">{courseTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Week navigator */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-800/50">
          <button
            onClick={() => navigateWeek(-1)}
            disabled={currentIdx <= 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="text-white font-medium text-sm">
              Semana de {formatWeekRange(selectedWeek)}
            </div>
            {isCurrentWeek && (
              <span className="text-xs text-orange-400">Semana atual</span>
            )}
          </div>
          <button
            onClick={() => navigateWeek(1)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {PROMPTS.map((prompt) => (
            <div key={prompt.key}>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                {prompt.label}
              </label>
              <textarea
                value={entry[prompt.key] || ""}
                onChange={(e) => updateField(prompt.key, e.target.value)}
                placeholder={prompt.placeholder}
                className="w-full bg-slate-800 border border-slate-700/40 rounded-xl px-4 py-3 text-slate-200 placeholder-gray-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 resize-none transition-colors text-sm leading-relaxed"
                rows={4}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/40">
          <div className="text-xs text-slate-500">
            {entry.updatedAt
              ? `Última edição: ${new Date(entry.updatedAt).toLocaleString("pt-BR")}`
              : hasContent
              ? ""
              : "Nenhuma entrada ainda"}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Fechar
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                saved
                  ? "bg-emerald-600 text-white"
                  : "bg-orange-600 hover:bg-orange-500 text-white"
              }`}
            >
              <Save className="w-4 h-4" />
              {saved ? "Salvo!" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyDiaryModal;
