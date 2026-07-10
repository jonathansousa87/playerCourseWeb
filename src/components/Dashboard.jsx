import React, { useEffect, useMemo, useState } from "react";
import {
  fetchDashboardStats,
  fetchProfileStats,
  fetchConfusionGroups,
  fetchActivityBalance,
  fetchHypercorrection,
  fetchRetentionBadges,
} from "../utils/progressApi";
import {
  fetchAdminDashboard,
  fetchAdminProfile,
  fetchAdminActivityBalance,
  fetchAdminRetentionBadges,
} from "../utils/adminApi";

const formatHour = (h) => `${String(h).padStart(2, "0")}h`;
const fmtPct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

const heatmapColor = (n) => {
  if (n === 0) return "bg-slate-800/60";
  if (n < 5) return "bg-emerald-900/60";
  if (n < 15) return "bg-emerald-700/70";
  if (n < 30) return "bg-emerald-500/80";
  return "bg-emerald-400";
};

// targetUserId (opcional): admin vendo o progresso de OUTRO usuario (view
// read-only — nunca revisa/grava nada dele). Sem isso, e o dashboard pessoal
// de sempre. Confusao semantica e hypercorreccao nao tem espelho admin (sao
// analises finas demais pra fazer sentido o admin fuçar por outra pessoa) —
// ficam sempre null nesse modo.
const Dashboard = ({ onBack, targetUserId, targetEmail }) => {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [confusion, setConfusion] = useState(null);
  const [balance, setBalance] = useState(null);
  const [hypercorrection, setHypercorrection] = useState(null);
  const [retentionBadges, setRetentionBadges] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, p, c, b, h, r] = await Promise.all([
          targetUserId ? fetchAdminDashboard(targetUserId) : fetchDashboardStats(),
          targetUserId ? fetchAdminProfile(targetUserId).catch(() => null) : fetchProfileStats().catch(() => null),
          targetUserId ? Promise.resolve(null) : fetchConfusionGroups({ minLapses: 2, threshold: 0.4 }).catch(() => null),
          targetUserId ? fetchAdminActivityBalance(targetUserId, 30).catch(() => null) : fetchActivityBalance(30).catch(() => null),
          targetUserId ? Promise.resolve(null) : fetchHypercorrection({ days: 30, limit: 8 }).catch(() => null),
          targetUserId ? fetchAdminRetentionBadges(targetUserId).catch(() => null) : fetchRetentionBadges().catch(() => null),
        ]);
        if (!cancelled) {
          setData(d);
          setProfile(p);
          setConfusion(c);
          setBalance(b);
          setHypercorrection(h);
          setRetentionBadges(r);
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
  }, [targetUserId]);

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
          <h2 className="text-lg font-bold text-slate-100">
            {targetUserId ? `Progresso de ${targetEmail || "usuário"}` : "Dashboard de estudo"}
          </h2>
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
        {/* Recall vs Leitura (desirable difficulties) */}
        {balance && <ActivityBalanceCard balance={balance} />}

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
                    className={`w-4 h-4 sm:w-3 sm:h-3 rounded-sm ${heatmapColor(cell.total)}`}
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

        {/* Conquistas (Bahrick — successful relearning) */}
        {retentionBadges && retentionBadges.totalMature > 0 && (
          <RetentionBadgesCard retention={retentionBadges} />
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

        {/* Hypercorrection: cards de alta confianca + erro (Metcalfe 2017) */}
        {hypercorrection && hypercorrection.cards && hypercorrection.cards.length > 0 && (
          <section className="bg-slate-900/60 border border-orange-500/30 rounded-2xl p-5">
            <h3 className="text-sm uppercase tracking-wider text-orange-300 mb-1">
              Hypercorrection — embaraco produtivo
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Cards onde voce achou que sabia (confianca alta) mas errou. Sao os mais
              valiosos pra revisar — erro com surpresa fixa muito mais (Metcalfe 2017).
            </p>
            <div className="space-y-2">
              {hypercorrection.cards.slice(0, 6).map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-4 py-2 border-b border-slate-800/50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-200 truncate" title={c.front}>
                      {c.front}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {c.course_title} · {c.lesson_prefix}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <span className="text-orange-300 font-bold">{c.surprise_errors}</span>
                    <span className="text-slate-600 text-xs"> erros / {c.high_conf_attempts} altas</span>
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

// ===========================================
// Card "Conquistas" - badges de retencao de longo prazo (Bahrick & Hall)
// Tier de tempo desde primeiro review + lista de marcos recentes (7d).
// ===========================================

const TIER_STYLES = {
  "1w": { color: "from-slate-600 to-slate-500", emoji: "·", text: "text-slate-300" },
  "1m": { color: "from-blue-600 to-blue-500", emoji: "*", text: "text-blue-300" },
  "3m": { color: "from-cyan-600 to-cyan-500", emoji: "+", text: "text-cyan-300" },
  "6m": { color: "from-emerald-600 to-emerald-500", emoji: "@", text: "text-emerald-300" },
  "1y": { color: "from-amber-500 to-orange-500", emoji: "#", text: "text-amber-300" },
  "2y": { color: "from-rose-500 to-pink-500", emoji: "%", text: "text-rose-300" },
};

const RetentionBadgesCard = ({ retention }) => {
  const { tiers, recentMilestones, totalMature } = retention;
  const earned = tiers.filter((t) => t.count > 0);

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm uppercase tracking-wider text-slate-400">
            Conquistas - retencao de longo prazo
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cards estaveis (state Review) por tempo desde o 1o review. Bahrick: 5 sessoes
            espacadas retem por DECADAS.
          </p>
        </div>
        <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
          {totalMature} maduro{totalMature === 1 ? "" : "s"}
        </span>
      </div>

      {earned.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">
          Nenhum tier alcancado ainda. Continue revisando — a primeira semana ja vale badge.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {tiers.map((t) => {
            const style = TIER_STYLES[t.key] || TIER_STYLES["1w"];
            const active = t.count > 0;
            return (
              <div
                key={t.key}
                className={`text-center p-3 rounded-xl border ${
                  active
                    ? `bg-gradient-to-br ${style.color} bg-opacity-20 border-current/30 ${style.text}`
                    : "bg-slate-800/30 border-slate-700/30 text-slate-600"
                }`}
              >
                <div className="text-2xl font-bold">{t.count}</div>
                <div className="text-[10px] uppercase tracking-wider opacity-80 mt-0.5">
                  {t.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recentMilestones && recentMilestones.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/60">
          <h4 className="text-xs uppercase tracking-wider text-amber-300 mb-2">
            Marcos batidos nos ultimos 7 dias
          </h4>
          <div className="space-y-1.5">
            {recentMilestones.slice(0, 5).map((m) => {
              const style = TIER_STYLES[m.tier] || TIER_STYLES["1w"];
              return (
                <div
                  key={m.cardId}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${style.text} bg-current/10 whitespace-nowrap`}>
                    {m.tierLabel}
                  </span>
                  <span className="text-slate-200 truncate flex-1" title={m.front}>
                    {m.front}
                  </span>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap" title={m.courseTitle}>
                    {m.courseTitle.length > 25 ? m.courseTitle.slice(0, 25) + "..." : m.courseTitle}
                  </span>
                </div>
              );
            })}
            {recentMilestones.length > 5 && (
              <div className="text-[11px] text-slate-500 text-center pt-1">
                + {recentMilestones.length - 5} marco{recentMilestones.length - 5 === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

// ===========================================
// Card "Recall vs Leitura" (Bjork & Bjork 2011)
// Estima minutos ativos vs passivos baseando-se em eventos persistidos.
// Mostra uma barra dividida em ativo/passivo + ratio + recomendacao.
// ===========================================

const LEVEL_STYLES = {
  good: {
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    label: "Otimo",
  },
  ok: {
    border: "border-blue-500/30",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    label: "OK",
  },
  warning: {
    border: "border-amber-500/30",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    label: "Atencao",
  },
  bad: {
    border: "border-red-500/30",
    badge: "bg-red-500/15 text-red-300 border-red-500/30",
    label: "Critico",
  },
  "no-data": {
    border: "border-slate-700",
    badge: "bg-slate-700/40 text-slate-400 border-slate-600/30",
    label: "Sem dados",
  },
};

const ActivityBalanceCard = ({ balance }) => {
  const { active, passive, ratio, level, recommendation, days } = balance;
  const total = active.totalSeconds + passive.totalSeconds;
  const activePct = total > 0 ? (active.totalSeconds / total) * 100 : 0;
  const passivePct = total > 0 ? (passive.totalSeconds / total) * 100 : 0;
  const styles = LEVEL_STYLES[level] || LEVEL_STYLES["no-data"];

  return (
    <section
      className={`bg-slate-900/60 border ${styles.border} rounded-2xl p-5`}
    >
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm uppercase tracking-wider text-slate-400">
            Recall vs Leitura ({days}d)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tempo ativo (testar) vs passivo (consumir). Bjork & Bjork: ler &ne; aprender.
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${styles.badge}`}
        >
          {styles.label}
          {ratio != null && <span className="ml-2 font-mono">{ratio.toFixed(2)}:1</span>}
        </span>
      </div>

      {total === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">
          Sem atividade nos ultimos {days} dias.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-emerald-300">
                  {active.totalMinutes}
                </span>
                <span className="text-xs text-slate-500">min ativo</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                <div>{active.breakdown.flashcards.count} flashcards</div>
                <div>
                  {active.breakdown.quiz.count} quiz
                  {active.breakdown.quiz.count > 0 &&
                    ` (${active.breakdown.quiz.questions} questoes)`}
                </div>
                <div>
                  {active.breakdown.prequiz.count} pre-quiz
                  {active.breakdown.prequiz.count > 0 &&
                    ` (${active.breakdown.prequiz.questions} questoes)`}
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-400">
                  {passive.totalMinutes}
                </span>
                <span className="text-xs text-slate-500">min passivo</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                <div>{passive.breakdown.video.count} videos assistidos</div>
                <div>{passive.breakdown.resumo.count} resumos lidos</div>
                <div>{passive.breakdown.exemplos.count} exemplos lidos</div>
              </div>
            </div>
          </div>

          <div className="h-3 rounded-full bg-slate-800/60 overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
              style={{ width: `${activePct}%` }}
              title={`Ativo: ${active.totalMinutes} min (${Math.round(activePct)}%)`}
            />
            <div
              className="h-full bg-gradient-to-r from-slate-600 to-slate-500 transition-all"
              style={{ width: `${passivePct}%` }}
              title={`Passivo: ${passive.totalMinutes} min (${Math.round(passivePct)}%)`}
            />
          </div>

          <p className="text-xs text-slate-300 mt-3 leading-relaxed">
            {recommendation}
          </p>

          <p className="text-[10px] text-slate-600 mt-2">
            Estimativa: ~10s/flashcard, ~30s/questao quiz, ~25s/questao pre-quiz, ~8min/video, ~4min/resumo, ~6min/exemplo.
          </p>
        </>
      )}
    </section>
  );
};

export default Dashboard;
