import React, { useEffect, useState } from "react";
import { LogOut, Settings, BarChart3, RefreshCw, Keyboard, ChevronRight, Bell, AlertTriangle, ShieldAlert, BookOpenText, Wallet, UploadCloud, Loader2, Check } from "lucide-react";
import CourseCard from "./CourseCard";
import { uploadReadingCourseToDrive } from "../utils/progressApi";
import ConfigModal from "./ConfigModal";
import OrphanCoursesModal from "./OrphanCoursesModal";
import AdminModal from "./AdminModal";
import ReadingBatchPicker from "./ReadingBatchPicker";
import ReadingBatchScreen from "./ReadingBatchScreen";
import {
  countLessons,
  countCompletedLessons,
  calculateModuleDuration,
} from "../utils/courseUtils";
import { fetchFlashcardSummary, fetchOrphanCourses, fetchDeepseekBalance } from "../utils/progressApi";
import { TYPING_TOTAL } from "../typing/curriculum";
import { useAuth } from "../contexts/AuthContext";

// Tela inicial: header com stats + grid de cursos + modal de config.
const CoursesScreen = ({
  courses,
  completedLessons,
  completedSteps,
  coursesPath,
  setCoursesPath,
  saveCoursesPath,
  videoDurations,
  showConfigModal,
  setShowConfigModal,
  onSelectCourse,
  onClearMaterials,
  onOpenTyping,
  typingCompleted = 0,
  onView,
  onCoursesChanged,
}) => {
  const { user, logout } = useAuth();

  // Revisao espacada vencida (por curso) — alimenta o banner + os selos.
  const [dueByCourse, setDueByCourse] = useState({});
  useEffect(() => {
    let alive = true;
    fetchFlashcardSummary()
      .then((rows) => {
        if (!alive) return;
        const map = {};
        for (const r of rows || []) if (r.due > 0) map[r.course_title] = r.due;
        setDueByCourse(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const totalDue = Object.values(dueByCourse).reduce((a, b) => a + b, 0);

  // Cursos orfaos (no banco mas nao na fonte atual).
  const [orphanCount, setOrphanCount] = useState(0);
  const [showOrphans, setShowOrphans] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  // Geracao de curso de leitura em lote: o picker escolhe os cursos; a
  // ReadingBatchScreen (3 colunas) configura e processa todos.
  const [showReadingPicker, setShowReadingPicker] = useState(false);
  const [batchCourses, setBatchCourses] = useState([]);
  // Saldo DeepSeek (consulta leve, nao gasta creditos de geracao).
  const [balance, setBalance] = useState(null);

  // Upload de curso de leitura pro Drive (estado por curso).
  const [driveUp, setDriveUp] = useState({});
  const handleUploadDrive = async (course) => {
    if (driveUp[course.title]?.status === "running") return;
    if (!window.confirm(`Enviar "${course.title}" pro Google Drive? (recria a estrutura e substitui arquivos de mesmo nome)`)) return;
    setDriveUp((s) => ({ ...s, [course.title]: { status: "running", done: 0, total: 0 } }));
    try {
      const r = await uploadReadingCourseToDrive({
        courseTitle: course.title,
        onProgress: (ev) => {
          if (ev.type === "start") setDriveUp((s) => ({ ...s, [course.title]: { status: "running", done: 0, total: ev.total } }));
          else if (ev.type === "file") setDriveUp((s) => ({ ...s, [course.title]: { status: "running", done: ev.done, total: ev.total } }));
        },
      });
      setDriveUp((s) => ({ ...s, [course.title]: { status: r.failed ? "warn" : "done", done: r.done, total: r.total, failed: r.failed } }));
    } catch (e) {
      setDriveUp((s) => ({ ...s, [course.title]: { status: "error", error: e.message } }));
    }
  };
  useEffect(() => { fetchDeepseekBalance().then(setBalance).catch(() => {}); }, []);
  const reloadOrphans = () =>
    fetchOrphanCourses()
      .then((res) => setOrphanCount((res.orphans || []).length))
      .catch(() => {});
  useEffect(() => { reloadOrphans(); }, []);

  const totalAllLessons = courses.reduce(
    (sum, c) => sum + countLessons(c.content || []),
    0,
  );
  const totalAllCompleted = courses.reduce((sum, c) => {
    const progress = completedLessons[c.title] || {};
    const steps = completedSteps[c.title] || {};
    return sum + countCompletedLessons(c.content || [], progress, steps);
  }, 0);

  const overallPct =
    totalAllLessons > 0
      ? Math.round((totalAllCompleted / totalAllLessons) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60">
        <div className="w-full px-6 lg:px-10 xl:px-14 py-5 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Meus Cursos</h1>
              <p className="text-sm text-slate-400">Plataforma de estudo com fixacao</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {totalAllLessons > 0 && (
              <div className="hidden md:flex items-center gap-6 mr-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-200">{totalAllCompleted}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Concluidas</div>
                </div>
                <div className="w-px h-8 bg-slate-700/60" />
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-200">{courses.length}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Cursos</div>
                </div>
                <div className="w-px h-8 bg-slate-700/60" />
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-400">{overallPct}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Progresso</div>
                </div>
              </div>
            )}
            {balance && balance.balance != null && (
              <div
                title="Saldo DeepSeek (creditos de IA)"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm ${
                  balance.balance < 1
                    ? "bg-red-600/15 border-red-500/30 text-red-300"
                    : balance.balance < 3
                      ? "bg-amber-600/15 border-amber-500/30 text-amber-300"
                      : "bg-slate-800/60 border-slate-700/50 text-slate-300"
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span className="tabular-nums">{balance.currency === "USD" ? "$" : ""}{balance.balance.toFixed(2)}</span>
              </div>
            )}
            <button
              onClick={() => onView("dashboard")}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 rounded-xl transition-all text-sm text-emerald-300 hover:text-emerald-200"
              title="Dashboard de estudo"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => onView("review")}
              className="flex items-center gap-2 px-3.5 py-2 bg-cyan-600/15 hover:bg-cyan-600/25 border border-cyan-500/20 rounded-xl transition-all text-sm text-cyan-300 hover:text-cyan-200"
              title="Revisar flashcards de todos os cursos"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Revisar</span>
            </button>
            <button
              onClick={() => setShowReadingPicker(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 rounded-xl transition-all text-sm text-emerald-300 hover:text-emerald-200"
              title="Gerar curso de leitura (escolha varios cursos)"
            >
              <BookOpenText className="w-4 h-4" />
              <span className="hidden sm:inline">Gerar leitura</span>
            </button>
            <button
              onClick={() => setShowAdmin(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/20 rounded-xl transition-all text-sm text-purple-300 hover:text-purple-200"
              title="Modo admin: renomear ou excluir cursos"
            >
              <ShieldAlert className="w-4 h-4" />
              <span className="hidden sm:inline">Admin</span>
            </button>
            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl transition-all text-sm text-slate-300 hover:text-white"
              title="Configuracoes"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Config</span>
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-red-900/40 border border-slate-700/50 hover:border-red-700/50 rounded-xl transition-all text-sm text-slate-400 hover:text-red-300"
              title={`Sair (${user?.email})`}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-10 xl:px-14 py-8">
        {totalDue > 0 && (
          <button
            onClick={() => onView("review")}
            className="w-full mb-6 flex items-center gap-3 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 rounded-2xl px-5 py-4 text-left transition-colors"
          >
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 flex-shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-amber-100 font-semibold">
                Voce tem {totalDue} card{totalDue === 1 ? "" : "s"} para revisar
              </div>
              <div className="text-amber-300/80 text-xs mt-0.5">
                A revisao espacada (FSRS) consolida o que voce ja estudou — faca agora pra nao acumular.
              </div>
            </div>
            <span className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg text-sm text-amber-200 font-medium flex-shrink-0">
              Revisar
            </span>
          </button>
        )}
        {orphanCount > 0 && (
          <button
            onClick={() => setShowOrphans(true)}
            className="w-full mb-6 flex items-center gap-3 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/30 rounded-2xl px-5 py-4 text-left transition-colors"
          >
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-rose-100 font-semibold">
                {orphanCount} curso{orphanCount === 1 ? "" : "s"} no banco nao existe{orphanCount === 1 ? "" : "m"} mais na fonte
              </div>
              <div className="text-rose-300/80 text-xs mt-0.5">
                Provavelmente pastas renomeadas/removidas. Revise e decida se limpa os dados (materiais, revisao, progresso).
              </div>
            </div>
            <span className="px-3 py-1.5 bg-rose-500/20 border border-rose-500/30 rounded-lg text-sm text-rose-200 font-medium flex-shrink-0">
              Revisar
            </span>
          </button>
        )}
        {totalAllLessons > 0 && (
          <div className="mb-8 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Progresso geral</span>
              <span className="text-sm font-medium text-slate-300">
                {totalAllCompleted} de {totalAllLessons} aulas
              </span>
            </div>
            <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {onOpenTyping && (
            <TypingCourseCard
              completed={typingCompleted}
              total={TYPING_TOTAL}
              onClick={onOpenTyping}
            />
          )}
          {courses.map((course, index) => {
            const courseProgress = completedLessons[course.title] || {};
            const courseSteps = completedSteps[course.title] || {};
            const total = countLessons(course.content || []);
            const completed = countCompletedLessons(
              course.content || [],
              courseProgress,
              courseSteps,
            );
            const { duration: durationSeconds } = calculateModuleDuration(
              course.content || [],
              videoDurations || {},
            );
            const due = dueByCourse[course.title] || 0;
            const isReading = / - Leitura$/.test(course.title);
            const up = driveUp[course.title];
            return (
              <div
                key={index}
                onClick={() => onSelectCourse(course)}
                className="cursor-pointer relative"
              >
                {isReading && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUploadDrive(course); }}
                    disabled={up?.status === "running"}
                    title="Enviar este curso de leitura para o Google Drive"
                    className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/85 border border-slate-600/50 text-slate-200 text-[11px] font-medium shadow hover:bg-slate-800 disabled:opacity-70"
                  >
                    {up?.status === "running" ? <Loader2 className="w-3 h-3 animate-spin" />
                      : up?.status === "done" ? <Check className="w-3 h-3 text-emerald-400" />
                        : up?.status === "error" || up?.status === "warn" ? <AlertTriangle className="w-3 h-3 text-amber-400" />
                          : <UploadCloud className="w-3 h-3" />}
                    {up?.status === "running" ? `${up.done}/${up.total}`
                      : up?.status === "done" ? "no Drive"
                        : up?.status === "warn" ? `${up.failed} falha(s)`
                          : up?.status === "error" ? "erro" : "Drive"}
                  </button>
                )}
                {due > 0 && (
                  <span
                    className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-amber-950 text-[11px] font-bold shadow"
                    title={`${due} card(s) para revisar`}
                  >
                    <Bell className="w-3 h-3" />
                    {due}
                  </span>
                )}
                <CourseCard
                  title={course.title}
                  description={course.description}
                  totalLessons={total}
                  completedCount={completed}
                  durationSeconds={durationSeconds}
                  index={index}
                  onClearMaterials={
                    onClearMaterials
                      ? () => onClearMaterials(course)
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      </main>

      {showConfigModal && (
        <ConfigModal
          coursesPath={coursesPath}
          onPathChange={setCoursesPath}
          onSave={saveCoursesPath}
          onCancel={() => setShowConfigModal(false)}
        />
      )}
      {showOrphans && (
        <OrphanCoursesModal
          onClose={() => setShowOrphans(false)}
          onCleaned={reloadOrphans}
        />
      )}
      {showAdmin && (
        <AdminModal
          courses={courses}
          onClose={() => setShowAdmin(false)}
          onChanged={() => { onCoursesChanged?.(); reloadOrphans(); }}
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

    </div>
  );
};

// Card fixo do curso de digitacao (sempre o primeiro da grade).
const TypingCourseCard = ({ completed, total, onClick }) => {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div
      onClick={onClick}
      className="cursor-pointer group relative bg-slate-800/80 rounded-2xl overflow-hidden border border-cyan-500/25 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1 h-full"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/20 via-blue-600/10 to-transparent opacity-70 group-hover:opacity-100 transition-opacity" />
      <div className="relative p-6 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2.5 rounded-xl bg-cyan-500/15">
            <Keyboard className="w-5 h-5 text-cyan-400" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5">
            Fixo
          </span>
        </div>
        <h3 className="text-lg font-semibold text-slate-100 mb-2 leading-snug group-hover:text-white transition-colors">
          Curso de Digitacao
        </h3>
        <p className="text-slate-400 text-sm flex-grow leading-relaxed line-clamp-3">
          Touch typing em PT-BR (ABNT2): da linha base aos acentos, com teclado na
          tela e foco na precisao. Sem joguinhos.
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>{completed}/{total} licoes</span>
            <span className="text-cyan-400 font-medium">{pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-end">
          <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-400 opacity-70 group-hover:opacity-100 transition-opacity">
            Praticar
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoursesScreen;
