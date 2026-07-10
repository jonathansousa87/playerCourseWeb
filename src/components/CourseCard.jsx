import React from "react";
import { BookOpen, CheckCircle2, ChevronRight, Clock } from "lucide-react";

// "12h 30min" / "45min". So mostra horas quando ha pelo menos 1h.
const formatCourseDuration = (seconds) => {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  return `${mins}min`;
};

const COURSE_GRADIENTS = [
  "from-blue-600/20 via-indigo-600/10 to-transparent",
  "from-emerald-600/20 via-teal-600/10 to-transparent",
  "from-violet-600/20 via-purple-600/10 to-transparent",
  "from-amber-600/20 via-orange-600/10 to-transparent",
  "from-rose-600/20 via-pink-600/10 to-transparent",
  "from-cyan-600/20 via-sky-600/10 to-transparent",
];

const COURSE_ACCENTS = [
  { ring: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/20", dot: "bg-blue-400" },
  { ring: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  { ring: "text-violet-400", bg: "bg-violet-500/15", border: "border-violet-500/20", dot: "bg-violet-400" },
  { ring: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/20", dot: "bg-amber-400" },
  { ring: "text-rose-400", bg: "bg-rose-500/15", border: "border-rose-500/20", dot: "bg-rose-400" },
  { ring: "text-cyan-400", bg: "bg-cyan-500/15", border: "border-cyan-500/20", dot: "bg-cyan-400" },
];

const ProgressRing = ({ progress, size = 52, strokeWidth = 3, color }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          className="text-slate-700/50"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className={color}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-slate-200">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
};

const CourseCard = ({ title, description, totalLessons = 0, completedCount = 0, durationSeconds = 0, index = 0 }) => {
  const gradient = COURSE_GRADIENTS[index % COURSE_GRADIENTS.length];
  const accent = COURSE_ACCENTS[index % COURSE_ACCENTS.length];
  const progress = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;
  const isComplete = totalLessons > 0 && completedCount === totalLessons;

  return (
    <div className={`group relative bg-slate-800/80 rounded-2xl overflow-hidden border ${accent.border} hover:border-opacity-60 transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1 h-full`}>
      {/* Gradient accent top */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-60 group-hover:opacity-100 transition-opacity duration-300`} />

      <div className="relative p-6 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className={`p-2.5 rounded-xl ${accent.bg} transition-colors duration-300`}>
            <BookOpen className={`w-5 h-5 ${accent.ring}`} />
          </div>
          {totalLessons > 0 && (
            <ProgressRing progress={progress} color={accent.ring} />
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-slate-100 mb-2 leading-snug group-hover:text-white transition-colors line-clamp-2">
          {title}
        </h3>

        {/* Description */}
        <p className="text-slate-400 text-sm flex-grow leading-relaxed line-clamp-3">
          {description}
        </p>

        {/* Footer stats */}
        <div className="mt-5 pt-4 border-t border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {totalLessons > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <BookOpen className="w-3.5 h-3.5" />
                {completedCount}/{totalLessons} aulas
              </span>
            )}
            {durationSeconds > 0 && (
              <span
                className="flex items-center gap-1.5 text-xs text-slate-400"
                title="Duracao total dos videos do curso"
              >
                <Clock className="w-3.5 h-3.5" />
                {formatCourseDuration(durationSeconds)}
              </span>
            )}
          </div>

          <div className={`flex items-center gap-1.5 text-xs font-medium transition-opacity ${
            isComplete ? "text-emerald-400" : `${accent.ring} opacity-70 group-hover:opacity-100`
          }`}>
            {isComplete ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completo
              </>
            ) : (
              <>
                Continuar
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseCard;
