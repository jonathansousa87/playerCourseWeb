import React, { useEffect, useMemo, useState } from "react";
import { fetchDashboardStats, fetchProfileStats, fetchConfusionGroups } from "../utils/progressApi";

const formatHour = (h) => `${String(h).padStart(2, "0")}h`;
const fmtPct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

const heatmapColor = (n) => {
  if (n === 0) return "bg-slate-800/60";
  if (n < 5) return "bg-emerald-900/60";
  if (n < 15) return "bg-emerald-700/70";
  if (n < 30) return "bg-emerald-500/80";
  return "bg-emerald-400";
};

const Dashboard = ({ onBack }) => {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [confusion, setConfusion] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, p, c] = await Promise.all([
          fetchDashboardStats(),
          fetchProfileStats().catch(() => null),
          fetchConfusionGroups({ minLapses: 2, threshold: 0.4 }).catch(() => null),
        ]);
        if (!cancelled) {
          setData(d);
          setProfile(p);
          setConfusion(c);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.message || "erro");
          setStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const heatmapWeeks = useMemo(() => {
    if (!data?.heatmap) return [];
    // Agrupa em colunas de 7 dias
    const cells = data.heatmap.map((d) => ({
      day: d.day,
      total: (d.reviews || 0) + (d.pomodoros || 0),
      reviews: d.reviews,
      pomodoros: d.pomodoros,
    }));
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [data]);

  const header = (
    <div className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="w-full px-6 lg:px-10 xl:px-14 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
          title="Voltar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Dashboard de estudo</h2>
          <p className="text-sm text-slate-400">Consistencia, retencao e backlog</p>
        </div>
      </div>
    </div>
  );

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {header}
        <div className="flex items-center justify-center py-20 text-slate-400">Carregando...</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {header}
        <div className="max-w-md mx-auto text-center py-20">
          <div className="text-lg text-red-400 mb-2">Erro ao carregar</div>
          <div className="text-sm text-slate-500">{errorMsg}</div>
        </div>
      </div>
    );
  }

  const { retention, topLapses, backlog } = data;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {header}
      <div className="w-full px-6 lg:px-10 xl:px-14 py-6 space-y-8">
        {/* Backlog */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-3">Backlog</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-3xl font-bold text-amber-300">{backlog.dueCards}</div>
              <div className="text-xs text-slate-500 mt-1">cards vencidos</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-300">{backlog.avgPerDay}</div>
              <div className="text-xs text-slate-500 mt-1">reviews/dia (14d)</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-300">
                {backlog.etaDays != null ? `${backlog.etaDays}d` : "—"}
              </div>
              <div className="text-xs text-slate-500 mt-1">ETA zero backlog</div>
            </div>
          </div>
        </section>

        {/* Heatmap */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-3">
            Consistencia (90 dias)
          </h3>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {heatmapWeeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((cell) => (
                  <div
                    key={cell.day}
                    title={`${cell.day}: ${cell.reviews} reviews + ${cell.pomodoros} pomodoros`}
                    className={`w-3 h-3 rounded-sm ${heatmapColor(cell.total)}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-500">
            <span>menos</span>
            <div className="w-3 h-3 rounded-sm bg-slate-800/60" />
            <div className="w-3 h-3 rounded-sm bg-emerald-900/60" />
            <div className="w-3 h-3 rounded-sm bg-emerald-700/70" />
            <div className="w-3 h-3 rounded-sm bg-emerald-500/80" />
            <div className="w-3 h-3 rounded-sm bg-emerald-400" />
            <span>mais</span>
          </div>
        </section>

        {/* Retencao */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-3">
            Retencao por curso
          </h3>
          {retention.length === 0 ? (
            <div className="text-sm text-slate-500">Sem reviews nos ultimos 30 dias.</div>
          ) : (
            <div className="space-y-3">
              {retention.map((r) => {
                const acc7 = r.n_7d > 0 ? Math.round((r.hit_7d / r.n_7d) * 100) : null;
                const acc30 = r.n_30d > 0 ? Math.round((r.hit_30d / r.n_30d) * 100) : null;
                return (
                  <div key={r.course_title} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-300 truncate" title={r.course_title}>
                      {r.course_title}
                    </span>
                    <div className="flex items-center gap-3 text-xs font-mono whitespace-nowrap">
                      <span>
                        <span className="text-slate-500">7d: </span>
                        <span className={acc7 != null && acc7 >= 80 ? "text-emerald-300" : acc7 != null && acc7 >= 60 ? "text-amber-300" : "text-red-300"}>
                          {acc7 != null ? `${acc7}%` : "—"}
                        </span>
                        <span className="text-slate-600"> ({r.n_7d})</span>
                      </span>
                      <span>
                        <span className="text-slate-500">30d: </span>
                        <span className={acc30 != null && acc30 >= 80 ? "text-emerald-300" : acc30 != null && acc30 >= 60 ? "text-amber-300" : "text-red-300"}>
                          {acc30 != null ? `${acc30}%` : "—"}
                        </span>
                        <span className="text-slate-600"> ({r.n_30d})</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Perfil cognitivo */}
        {profile && (
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-3">
              Perfil cognitivo
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-3xl font-bold text-orange-300">
                  {profile.streak}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  dias seguidos estudando
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-300">
                  {profile.bestHour ? formatHour(profile.bestHour.hour) : "—"}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  hora otima
                  {profile.bestHour && (
                    <span className="block text-[10px] text-emerald-400/80">
                      {fmtPct(profile.bestHour.accuracy)} · {profile.bestHour.n} reviews
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-rose-300">
                  {profile.worstHour ? formatHour(profile.worstHour.hour) : "—"}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  hora fraca
                  {profile.worstHour && (
                    <span className="block text-[10px] text-rose-400/80">
                      {fmtPct(profile.worstHour.accuracy)} · {profile.worstHour.n} reviews
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div
                  className={`text-3xl font-bold ${
                    profile.difficulty.drift == null
                      ? "text-slate-500"
                      : profile.difficulty.drift > 0.02
                        ? "text-amber-300"
                        : profile.difficulty.drift < -0.02
                          ? "text-emerald-300"
                          : "text-slate-300"
                  }`}
                >
                  {profile.difficulty.drift == null
                    ? "—"
                    : (profile.difficulty.drift > 0 ? "+" : "") +
                      profile.difficulty.drift.toFixed(2)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  drift D (7d vs 7-30d)
                  <span className="block text-[10px] text-slate-600">
                    {profile.difficulty.drift == null
                      ? ""
                      : profile.difficulty.drift > 0.02
                        ? "cards mais dificeis"
                        : profile.difficulty.drift < -0.02
                          ? "cards mais faceis"
                          : "estavel"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center gap-6 text-xs text-slate-400">
              <span>
                Total: <strong className="text-slate-200">{profile.totals.reviews}</strong> reviews
              </span>
              <span>
                Cards: <strong className="text-slate-200">{profile.totals.cards}</strong>
              </span>
              <span>
                Maduros: <strong className="text-emerald-300">{profile.totals.matureCards}</strong>
              </span>
            </div>
          </section>
        )}

        {/* Cards confusos (similares entre si) */}
        {confusion && confusion.groups && confusion.groups.length > 0 && (
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-1">
              Cards confusos
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Cards com perguntas parecidas que voce esta errando — revise lado a lado pra
              separar os conceitos na memoria.
            </p>
            <div className="space-y-4">
              {confusion.groups.slice(0, 6).map((group, gi) => (
                <div
                  key={gi}
                  className="bg-purple-950/15 border border-purple-500/20 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-purple-300 font-medium">
                      Grupo {gi + 1} · {group.cards.length} cards similares
                    </span>
                    <span className="text-xs text-red-400/80">
                      {group.totalLapses} lapsos totais
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.cards.map((c) => (
                      <div
                        key={c.id}
                        className="bg-slate-900/80 border border-slate-700/40 rounded-lg p-3"
                      >
                        <div className="text-sm text-slate-100 font-medium mb-1.5">
                          {c.front}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-2 mb-2">
                          {c.back}
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500 truncate" title={c.courseTitle}>
                            {c.courseTitle}
                          </span>
                          <span className="text-red-400 font-semibold whitespace-nowrap ml-2">
                            {c.lapses} lapsos
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top lapsos */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-3">
            Cards mais problematicos
          </h3>
          {topLapses.length === 0 ? (
            <div className="text-sm text-slate-500">Nenhum card com lapsos ainda.</div>
          ) : (
            <div className="space-y-2">
              {topLapses.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-4 py-2 border-b border-slate-800/50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-200 truncate" title={c.front}>
                      {c.front}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {c.course_title} · {c.lesson_prefix}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <span className="text-red-400 font-bold">{c.lapses}</span>
                    <span className="text-slate-600 text-xs"> lapsos / {c.reps} reps</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
