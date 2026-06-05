import React, { useState } from "react";
import { X, FileText } from "lucide-react";
import TechnicalDiary from "./TechnicalDiary";
import { flattenCourseContent } from "../utils/courseUtils";
import { getMediaUrl } from "../utils/fileUtils";
import { API_BASE } from "../config";

// URL do template do diario tecnico de uma aula (gerado por IA — pode viver no
// banco como "__db__" ou em arquivo no curso).
const buildDiarioUrl = (courseTitle, lesson) => {
  const mat = lesson.materials?.diario;
  if (!mat) return "";
  if (mat.path === "__db__") {
    return `${API_BASE}/api/materials/${encodeURIComponent(courseTitle)}/${encodeURIComponent(lesson.prefix)}/diario`;
  }
  return getMediaUrl(courseTitle, mat.path);
};

// Revisao de diario tecnico no nivel do modulo/curso: lista as aulas que tem
// diario gerado e abre cada uma para ler/editar.
const TechnicalDiaryReviewModal = ({ courseTitle, courseContent, onClose }) => {
  const lessons = flattenCourseContent(courseContent || []).filter(
    (l) => l.type === "lesson-group" && l.materials?.diario,
  );
  const [selected, setSelected] = useState(lessons[0] || null);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700/50 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-700/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-semibold text-slate-100">Diario tecnico do modulo</h2>
            <span className="text-xs text-slate-500">{lessons.length} aula(s) com diario</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {lessons.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div className="max-w-sm">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 font-medium mb-1">Nenhum diario gerado ainda</p>
              <p className="text-sm text-slate-500">
                Gere o diario tecnico de uma aula pelo botao Gerar IA (opcao Diario). Ele
                aparecera aqui para revisao, sem ocupar a pipeline da aula.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <aside className="w-60 flex-shrink-0 border-r border-slate-700/40 overflow-y-auto p-2 space-y-1">
              {lessons.map((l) => {
                const active = selected?.prefix === l.prefix;
                return (
                  <button
                    key={l.prefix}
                    onClick={() => setSelected(l)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                      active
                        ? "bg-rose-500/15 text-rose-200 border border-rose-500/25"
                        : "text-slate-300 hover:bg-slate-800/80 border border-transparent"
                    }`}
                    title={l.title}
                  >
                    {l.title}
                  </button>
                );
              })}
            </aside>
            <div className="flex-1 min-h-0">
              {selected && (
                <TechnicalDiary
                  key={selected.prefix}
                  courseTitle={courseTitle}
                  lessonPrefix={selected.prefix}
                  templateUrl={buildDiarioUrl(courseTitle, selected)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TechnicalDiaryReviewModal;
