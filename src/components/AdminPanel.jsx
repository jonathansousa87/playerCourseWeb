import React, { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, ShieldX, ShieldAlert, RotateCcw, Loader2, Pencil, Trash2, BookOpenText, ListChecks, BarChart3, X, Check } from "lucide-react";
import { fetchAdminUsers, updateAdminUser, fetchUserCourses, saveUserCourses } from "../utils/adminApi";
import AdminModal from "./AdminModal";
import OrphanCoursesModal from "./OrphanCoursesModal";
import ReadingBatchPicker from "./ReadingBatchPicker";
import ReadingBatchScreen from "./ReadingBatchScreen";
import Dashboard from "./Dashboard";
import { useAuth } from "../contexts/AuthContext";

const STATUS_LABEL = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  suspended: "Suspenso",
};

const STATUS_STYLE = {
  pending: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  approved: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  rejected: "bg-red-500/15 border-red-500/30 text-red-300",
  suspended: "bg-slate-600/25 border-slate-500/30 text-slate-300",
};

const fmtDate = (iso) => new Date(iso).toLocaleString("pt-BR");

// Painel administrativo: so visivel/acessivel pra quem tem role=admin (gate
// real e no backend, ver requireAdmin em server/auth.js — o frontend so
// esconde o botao de entrada). Aba "Usuarios" e a aprovacao de cadastro;
// "Cursos" e "Orfaos" reaproveitam os modais que ja existiam soltos.
const AdminPanel = ({ courses, onBack, onCoursesChanged }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState("usuarios"); // usuarios | cursos | orfaos | leitura
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // user_id em acao
  const [showReadingPicker, setShowReadingPicker] = useState(false);
  const [batchCourses, setBatchCourses] = useState([]);
  const [coursesModalUser, setCoursesModalUser] = useState(null); // { user_id, email } | null
  const [progressUser, setProgressUser] = useState(null); // { user_id, email } | null

  const load = () => {
    setError(null);
    fetchAdminUsers()
      .then(setUsers)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const act = async (userId, patch) => {
    setBusy(userId);
    setError(null);
    try {
      const updated = await updateAdminUser(userId, patch);
      setUsers((prev) => prev.map((u) => (u.user_id === userId ? updated : u)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const pendingCount = (users || []).filter((u) => u.status === "pending").length;

  if (progressUser) {
    return (
      <Dashboard
        targetUserId={progressUser.user_id}
        targetEmail={progressUser.email}
        onBack={() => setProgressUser(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="w-full px-6 lg:px-10 xl:px-14 py-4 flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Voltar">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Painel administrativo</h2>
            <p className="text-sm text-slate-400">Aprovação de contas, cursos e limpeza de dados</p>
          </div>
        </div>
        <div className="w-full px-6 lg:px-10 xl:px-14 flex gap-2 pb-3">
          <TabButton active={tab === "usuarios"} onClick={() => setTab("usuarios")}>
            Usuários {pendingCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">{pendingCount}</span>}
          </TabButton>
          <TabButton active={tab === "cursos"} onClick={() => setTab("cursos")}>Cursos</TabButton>
          <TabButton active={tab === "orfaos"} onClick={() => setTab("orfaos")}>Cursos órfãos</TabButton>
          <TabButton active={tab === "leitura"} onClick={() => setTab("leitura")}>Gerar leitura</TabButton>
        </div>
      </div>

      <main className="w-full px-6 lg:px-10 xl:px-14 py-8">
        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</div>
        )}

        {tab === "usuarios" && (
          users === null ? (
            <div className="py-12 text-center text-slate-400">Carregando...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-slate-400">Nenhum usuário logou ainda.</div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.user_id} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-slate-100 text-sm font-medium truncate">{u.email}</div>
                    <div className="text-slate-500 text-xs mt-0.5">
                      {u.role === "admin" ? "Administrador" : "Usuário"} · desde {fmtDate(u.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${STATUS_STYLE[u.status]}`}>
                      {STATUS_LABEL[u.status] || u.status}
                    </span>
                    {u.user_id === user?.id ? (
                      <span className="text-xs text-slate-500 px-2">(você)</span>
                    ) : (
                      <>
                        <button
                          onClick={() => setProgressUser(u)}
                          className="px-2.5 py-1.5 border rounded-lg text-xs font-medium flex items-center gap-1.5 bg-indigo-600/15 hover:bg-indigo-600/25 border-indigo-500/30 text-indigo-300"
                        >
                          <BarChart3 className="w-3.5 h-3.5" /> Progresso
                        </button>
                        {u.role !== "admin" && (
                          <button
                            onClick={() => setCoursesModalUser(u)}
                            className="px-2.5 py-1.5 border rounded-lg text-xs font-medium flex items-center gap-1.5 bg-sky-600/15 hover:bg-sky-600/25 border-sky-500/30 text-sky-300"
                          >
                            <ListChecks className="w-3.5 h-3.5" /> Cursos
                          </button>
                        )}
                        {busy === u.user_id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <UserActions status={u.status} onAct={(status) => act(u.user_id, { status })} />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "cursos" && (
          <button
            onClick={() => setTab("cursos-open")}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/20 rounded-xl text-sm text-purple-300"
          >
            <Pencil className="w-4 h-4" /> Renomear ou excluir cursos
          </button>
        )}

        {tab === "orfaos" && (
          <button
            onClick={() => setTab("orfaos-open")}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/20 rounded-xl text-sm text-rose-300"
          >
            <Trash2 className="w-4 h-4" /> Revisar cursos órfãos
          </button>
        )}

        {tab === "leitura" && (
          <button
            onClick={() => setShowReadingPicker(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 rounded-xl text-sm text-emerald-300"
          >
            <BookOpenText className="w-4 h-4" /> Gerar curso de leitura
          </button>
        )}
      </main>

      {tab === "cursos-open" && (
        <AdminModal
          courses={courses}
          onClose={() => setTab("cursos")}
          onChanged={() => onCoursesChanged?.()}
        />
      )}
      {tab === "orfaos-open" && (
        <OrphanCoursesModal
          onClose={() => setTab("orfaos")}
          onCleaned={() => onCoursesChanged?.()}
        />
      )}
      {showReadingPicker && (
        <ReadingBatchPicker
          courses={courses}
          onClose={() => setShowReadingPicker(false)}
          onStart={(queue) => { setBatchCourses(queue); setShowReadingPicker(false); }}
        />
      )}
      {batchCourses.length > 0 && (
        <ReadingBatchScreen
          courses={batchCourses}
          onClose={() => { setBatchCourses([]); onCoursesChanged?.(); }}
        />
      )}
      {coursesModalUser && (
        <UserCoursesModal
          targetUser={coursesModalUser}
          courses={courses}
          onClose={() => setCoursesModalUser(null)}
        />
      )}
    </div>
  );
};

// Marca quais cursos (da lista completa, `courses` — a mesma que o admin ve)
// ficam liberados pro usuario-alvo. Admin sempre ve tudo, entao esse modal so
// e oferecido pra role='user' (ver botao "Cursos" acima).
const UserCoursesModal = ({ targetUser, courses, onClose }) => {
  const [selected, setSelected] = useState(null); // Set<string> | null (carregando)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUserCourses(targetUser.user_id)
      .then((titles) => setSelected(new Set(titles)))
      .catch((e) => setError(e.message));
  }, [targetUser.user_id]);

  const toggle = (title) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveUserCourses(targetUser.user_id, [...selected]);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-700/50">
          <div>
            <h3 className="text-slate-100 font-semibold text-lg">Cursos liberados</h3>
            <p className="text-slate-400 text-sm mt-0.5 truncate" title={targetUser.email}>{targetUser.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 leading-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-1.5">
          {error && (
            <div className="mb-2 text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</div>
          )}
          {selected === null ? (
            <div className="py-8 text-center text-slate-400 text-sm">Carregando...</div>
          ) : (courses || []).length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">Nenhum curso na fonte atual.</div>
          ) : (
            courses.map((c) => {
              const active = selected.has(c.title);
              return (
                <button
                  key={c.title}
                  onClick={() => toggle(c.title)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all"
                  style={{
                    background: active ? "rgba(16,185,129,0.1)" : "rgba(51,65,85,0.3)",
                    borderColor: active ? "rgba(16,185,129,0.4)" : "rgba(71,85,105,0.4)",
                  }}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${active ? "bg-emerald-500 border-emerald-500" : "border-slate-500"}`}>
                    {active && <Check className="w-3 h-3 text-slate-950" />}
                  </span>
                  <span className="text-sm text-slate-200 truncate">{c.title}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-6 pt-4 border-t border-slate-700/50 flex gap-2.5">
          <button
            onClick={handleSave}
            disabled={saving || selected === null}
            className="flex-1 px-4 py-2.5 bg-emerald-600/90 hover:bg-emerald-500/90 disabled:opacity-50 rounded-xl text-sm font-medium text-white transition-all"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl text-sm text-slate-300">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      active ? "bg-slate-700/80 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
    }`}
  >
    {children}
  </button>
);

const ACTIONS = {
  pending: [
    { status: "approved", label: "Aprovar", icon: ShieldCheck, cls: "bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-300" },
    { status: "rejected", label: "Rejeitar", icon: ShieldX, cls: "bg-red-600/15 hover:bg-red-600/25 border-red-500/30 text-red-300" },
  ],
  approved: [
    { status: "suspended", label: "Suspender", icon: ShieldAlert, cls: "bg-slate-600/20 hover:bg-slate-600/30 border-slate-500/30 text-slate-300" },
  ],
  rejected: [
    { status: "approved", label: "Aprovar", icon: ShieldCheck, cls: "bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-300" },
  ],
  suspended: [
    { status: "approved", label: "Reativar", icon: RotateCcw, cls: "bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-300" },
  ],
};

const UserActions = ({ status, onAct }) => (
  <div className="flex items-center gap-1.5">
    {(ACTIONS[status] || []).map(({ status: next, label, icon: Icon, cls }) => (
      <button
        key={next}
        onClick={() => onAct(next)}
        className={`px-2.5 py-1.5 border rounded-lg text-xs font-medium flex items-center gap-1.5 ${cls}`}
      >
        <Icon className="w-3.5 h-3.5" /> {label}
      </button>
    ))}
  </div>
);

export default AdminPanel;
