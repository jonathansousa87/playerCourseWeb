import React, { useState } from "react";
import { X, Pencil, Trash2, Eraser, Loader2, Check, ShieldAlert } from "lucide-react";
import { renameCourse, deleteCourseFull, clearCourseMaterials } from "../utils/progressApi";

// Modo admin: renomear (reflete no banco + renomeia a pasta na fonte),
// limpar materiais gerados por IA (so o banco, nunca a pasta na fonte) ou
// excluir um curso (apaga a pasta na fonte E tudo do banco). Destrutivo.
const AdminModal = ({ courses, onClose, onChanged }) => {
  const [editing, setEditing] = useState(null); // title em edicao
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(null); // title aguardando confirmacao de exclusao
  const [confirmingClear, setConfirmingClear] = useState(null); // title aguardando confirmacao de limpeza
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const startEdit = (title) => { setEditing(title); setDraft(title); setErr(null); };

  const doRename = async (from) => {
    const to = draft.trim();
    if (!to || to === from) { setEditing(null); return; }
    setBusy(from); setErr(null); setMsg(null);
    try {
      await renameCourse(from, to);
      setMsg(`Renomeado para "${to}".`);
      setEditing(null);
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async (title) => {
    setBusy(title); setErr(null); setMsg(null);
    try {
      const res = await deleteCourseFull(title);
      setMsg(`"${title}" excluido (pasta ${res.folderRemoved ? "removida" : "nao encontrada"}, ${res.total} registros).`);
      setConfirming(null);
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const doClearMaterials = async (title) => {
    setBusy(title); setErr(null); setMsg(null);
    try {
      const res = await clearCourseMaterials(title);
      const { materials = 0, flashcardDecks = 0, prequestions = 0 } = res.deleted || {};
      setMsg(`Material de "${title}" removido: ${materials} materiais, ${flashcardDecks} decks de flashcards, ${prequestions} pre-quiz.`);
      setConfirmingClear(null);
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/15 text-purple-300">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-slate-100 font-semibold text-lg">Modo admin</h3>
              <p className="text-slate-400 text-sm mt-0.5">
                Renomear mantem tudo atrelado. Excluir apaga a pasta na fonte E o banco.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 leading-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {err && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{err}</div>
          )}
          {msg && (
            <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2 flex items-center gap-2">
              <Check className="w-4 h-4" /> {msg}
            </div>
          )}

          {(courses || []).length === 0 ? (
            <div className="py-12 text-center text-slate-400">Nenhum curso na fonte atual.</div>
          ) : (
            courses.map((c) => (
              <div key={c.title} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
                {editing === c.title ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") doRename(c.title); if (e.key === "Escape") setEditing(null); }}
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-purple-500/50"
                    />
                    <button
                      onClick={() => doRename(c.title)}
                      disabled={busy === c.title}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {busy === c.title ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Salvar
                    </button>
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-100 text-sm truncate min-w-0" title={c.title}>{c.title}</span>
                    {confirming === c.title ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-red-300">Apagar pasta + dados?</span>
                        <button
                          onClick={() => doDelete(c.title)}
                          disabled={busy === c.title}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {busy === c.title ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Excluir
                        </button>
                        <button onClick={() => setConfirming(null)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs">
                          Cancelar
                        </button>
                      </div>
                    ) : confirmingClear === c.title ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-amber-300">Apagar materiais gerados?</span>
                        <button
                          onClick={() => doClearMaterials(c.title)}
                          disabled={busy === c.title}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {busy === c.title ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
                          Limpar
                        </button>
                        <button onClick={() => setConfirmingClear(null)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => startEdit(c.title)}
                          className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Renomear
                        </button>
                        <button
                          onClick={() => setConfirmingClear(c.title)}
                          title="Apaga resumos, quizzes, exemplos, flashcards e pre-quiz gerados por IA deste curso (nao remove o curso nem os arquivos no Drive)"
                          className="px-3 py-1.5 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-medium flex items-center gap-1.5"
                        >
                          <Eraser className="w-3.5 h-3.5" /> Limpar materiais
                        </button>
                        <button
                          onClick={() => setConfirming(c.title)}
                          className="px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-6 pt-4 border-t border-slate-700/50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default AdminModal;
