import React, { useEffect, useState } from "react";
import { X, AlertTriangle, Trash2, Loader2, Check } from "lucide-react";
import { fetchOrphanCourses, cleanupCourse } from "../utils/progressApi";

// Lista cursos que existem no banco mas sumiram da fonte atual (ex.: pasta
// renomeada no Drive) e deixa o usuario decidir limpar TUDO daquele curso.
const OrphanCoursesModal = ({ onClose, onCleaned }) => {
  const [orphans, setOrphans] = useState(null);
  const [warning, setWarning] = useState(null);
  const [confirming, setConfirming] = useState(null); // course_title aguardando confirmacao
  const [busy, setBusy] = useState(null); // course_title sendo limpo
  const [doneMsg, setDoneMsg] = useState(null);

  const load = () => {
    setOrphans(null);
    fetchOrphanCourses()
      .then((res) => { setOrphans(res.orphans || []); setWarning(res.warning || null); })
      .catch((err) => { setOrphans([]); setWarning(err.message); });
  };
  useEffect(load, []);

  const handleClean = async (course) => {
    setBusy(course);
    try {
      const res = await cleanupCourse(course);
      setOrphans((prev) => prev.filter((o) => o.course_title !== course));
      setDoneMsg(`"${course}" removido (${res.total} registros).`);
      onCleaned?.();
    } catch (err) {
      setDoneMsg(`Erro ao limpar: ${err.message}`);
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/15 text-amber-300">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-slate-100 font-semibold text-lg">Cursos orfaos no banco</h3>
              <p className="text-slate-400 text-sm mt-0.5">
                Existem no banco mas nao na fonte atual. Voce decide se limpa.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 leading-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {warning && (
            <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
              {warning}
            </div>
          )}
          {doneMsg && (
            <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2 flex items-center gap-2">
              <Check className="w-4 h-4" /> {doneMsg}
            </div>
          )}

          {orphans === null ? (
            <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Verificando...
            </div>
          ) : orphans.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-slate-300">Nenhum curso orfao — o banco esta alinhado com a fonte.</div>
            </div>
          ) : (
            orphans.map((o) => (
              <div key={o.course_title} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-slate-100 font-medium truncate" title={o.course_title}>{o.course_title}</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {Object.entries(o.counts).map(([label, n]) => `${n} ${label}`).join(" · ") || "sem dados"}
                      {o.total > 0 && <span className="text-slate-400"> — {o.total} registros</span>}
                    </div>
                  </div>
                  {confirming === o.course_title ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleClean(o.course_title)}
                        disabled={busy === o.course_title}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {busy === o.course_title ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirming(o.course_title)}
                      className="px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Limpar tudo
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 pt-4 border-t border-slate-700/50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrphanCoursesModal;
