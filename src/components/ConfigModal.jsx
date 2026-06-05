import React, { useEffect, useState } from "react";
import { migrateLocalStorage } from "../utils/progressApi";
import { supabase } from "../lib/supabase";
import { useTheme } from "../contexts/ThemeContext";
import { API_BASE } from "../config";

const API = API_BASE;

const PLATFORM_FIELDS = [
  { key: "google_client_id",     label: "Google Client ID",     type: "text" },
  { key: "google_client_secret", label: "Google Client Secret", type: "password" },
  { key: "google_refresh_token", label: "Google Refresh Token", type: "password" },
  { key: "drive_folder_id",      label: "Drive Folder ID",      type: "text" },
  { key: "deepseek_api_key",     label: "DeepSeek API Key",     type: "password" },
];

// Le o localStorage legado e monta o payload esperado pelo endpoint de migracao.
const collectLegacyPayload = () => {
  const payload = {
    lessons: [],
    steps: [],
    diaries: [],
    notes: [],
    pomodoros: [],
  };

  try {
    const raw = localStorage.getItem("courseProgress");
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [courseTitle, lessons] of Object.entries(parsed)) {
        for (const [lessonPath, done] of Object.entries(lessons || {})) {
          if (done) payload.lessons.push({ courseTitle, lessonPath });
        }
      }
    }
  } catch (e) {
    console.error("Erro ao ler courseProgress:", e);
  }

  try {
    const raw = localStorage.getItem("completedSteps");
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [fullKey, done] of Object.entries(parsed)) {
        if (!done) continue;
        const sep = fullKey.indexOf("__");
        if (sep < 0) continue;
        const lessonPrefix = fullKey.slice(0, sep);
        const stepKey = fullKey.slice(sep + 2);
        // Nao sabemos mais o courseTitle do legacy (era global).
        payload.steps.push({ courseTitle: "__legacy__", lessonPrefix, stepKey });
      }
    }
  } catch (e) {
    console.error("Erro ao ler completedSteps:", e);
  }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("weeklyDiary_") && !key.startsWith("weeklyDiaryLastPrompt_")) {
      try {
        const courseTitle = key.slice("weeklyDiary_".length);
        const value = JSON.parse(localStorage.getItem(key) || "{}");
        for (const [weekKey, entry] of Object.entries(value)) {
          payload.diaries.push({
            courseTitle,
            weekKey,
            learned: entry?.learned || "",
            decisions: entry?.decisions || "",
            different: entry?.different || "",
          });
        }
      } catch (e) {
        console.error("Erro ao ler diario legacy", key, e);
      }
    }
  }

  return payload;
};

const ConfigModal = ({ coursesPath, onPathChange, onSave, onCancel }) => {
  const { theme, setTheme, themes } = useTheme();
  // Caminho carregado ao abrir o modal — usado para so salvar se realmente mudou.
  const [initialPath] = useState(coursesPath);
  const [migrating, setMigrating] = useState(false);
  const [migrationMsg, setMigrationMsg] = useState("");
  const [driveStatus, setDriveStatus] = useState(null);
  const [platformSettings, setPlatformSettings] = useState({});
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [platformMsg, setPlatformMsg] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/drive/status`)
      .then((r) => r.json())
      .then(setDriveStatus)
      .catch(() => {});

    supabase.from("user_settings").select("settings").maybeSingle()
      .then(({ data }) => setPlatformSettings(data?.settings ?? {}))
      .catch(() => {});
  }, []);

  const updateField = (key, value) =>
    setPlatformSettings((prev) => ({ ...prev, [key]: value }));

  const handleSavePlatform = async () => {
    setSavingPlatform(true);
    setPlatformMsg("");
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (!userId) throw new Error("nao autenticado");
      const { error } = await supabase.from("user_settings").upsert({
        user_id: userId,
        settings: platformSettings,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      setPlatformMsg("Credenciais salvas. O app mobile usa essas mesmas credenciais.");
    } catch (e) {
      setPlatformMsg(`Erro: ${e.message}`);
    }
    setSavingPlatform(false);
  };

  const handleMigrate = async () => {
    if (migrating) return;
    setMigrating(true);
    setMigrationMsg("");
    try {
      const payload = collectLegacyPayload();
      const result = await migrateLocalStorage(payload);
      const s = result.summary || {};
      setMigrationMsg(
        `Migrado: ${s.lessons || 0} aulas, ${s.steps || 0} etapas, ${s.diaries || 0} diarios, ${s.notes || 0} resumos, ${s.pomodoros || 0} pomodoros.`,
      );
    } catch (err) {
      console.error(err);
      setMigrationMsg(`Erro na migracao: ${err.message}`);
    }
    setMigrating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="rounded-2xl p-6 w-full max-w-md border max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-strong)",
        }}
      >
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text)" }}>
          Configurações
        </h2>

        {/* Tema visual */}
        <div className="mb-5">
          <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
            Tema visual
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--text-subtle)" }}>
            Cores baseadas em neurociência para reduzir fadiga ocular em sessões longas.
            O tema é aplicado e salvo automaticamente ao clicar — não precisa do botão Salvar.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {themes.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className="flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:bg-[var(--surface-hover)]"
                  style={{
                    background: active ? "var(--accent-soft)" : "var(--bg-soft)",
                    borderColor: active ? "var(--accent)" : "var(--border)",
                  }}
                >
                  <div className="flex gap-1 flex-shrink-0">
                    {t.swatches.map((c, i) => (
                      <span
                        key={i}
                        className="w-5 h-5 rounded-full border"
                        style={{ background: c, borderColor: "var(--border)" }}
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {t.label}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-subtle)" }}>
                      {t.description}
                    </div>
                  </div>
                  {active && (
                    <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                      ativo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
            Caminho dos Cursos:
          </label>
          <input
            type="text"
            value={coursesPath}
            onChange={(e) => onPathChange(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700/50 rounded-xl text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/40 text-sm"
            placeholder="/caminho/para/os/cursos/"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Informe o caminho completo onde estao localizados os cursos
          </p>
        </div>

        <div className="mb-5 border-t border-slate-700/40 pt-4">
          <div className="text-sm font-medium text-slate-300 mb-2">
            Migrar dados do navegador
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Envia progresso e diarios salvos no localStorage para o banco.
            Execute uma unica vez apos ligar o Postgres.
          </p>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 rounded-xl text-sm font-medium text-white disabled:opacity-50"
          >
            {migrating ? "Migrando..." : "Migrar localStorage"}
          </button>
          {migrationMsg && (
            <p className="text-xs text-slate-400 mt-2">{migrationMsg}</p>
          )}
        </div>

        {/* Google Drive */}
        <div className="mb-5 border-t border-slate-700/40 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-slate-300">Google Drive</div>
            {driveStatus && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                driveStatus.connected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-slate-700/40 border-slate-600/30 text-slate-500"
              }`}>
                {driveStatus.connected ? "Conectado" : "Nao conectado"}
              </span>
            )}
          </div>
          {driveStatus?.source === "drive" ? (
            <p className="text-xs text-emerald-400 mb-2">
              Fonte ativa: Drive (pasta: {driveStatus.folderId || "nao configurada"})
            </p>
          ) : (
            <p className="text-xs text-slate-500 mb-2">
              Fonte ativa: filesystem local
            </p>
          )}
          {driveStatus?.connected ? (
            <p className="text-xs mb-3" style={{ color: "var(--text-subtle)" }}>
              Se os cursos pararem de aparecer, clique em Reconectar para renovar a autorização. O token é salvo automaticamente.
            </p>
          ) : (
            <p className="text-xs mb-3" style={{ color: "var(--text-subtle)" }}>
              Clique em Conectar, autorize no Google e o token será salvo automaticamente — sem precisar editar arquivos.
            </p>
          )}
          <button
            onClick={() => window.open(`${API}/api/drive/auth`, "_blank")}
            disabled={!driveStatus?.configured}
            className="px-4 py-2 bg-blue-700/60 hover:bg-blue-600/70 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white border border-blue-600/30 transition-colors"
          >
            {driveStatus?.connected ? "Reconectar Drive" : "Conectar Google Drive"}
          </button>
          {driveStatus && !driveStatus.configured && (
            <p className="text-xs text-amber-400 mt-1.5">
              Credenciais Google não configuradas no servidor.
            </p>
          )}
        </div>

        {/* Credenciais da plataforma (compartilhado com app mobile) */}
        <div className="mb-5 border-t border-slate-700/40 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-slate-300">
              Credenciais da plataforma
            </div>
            <button
              onClick={() => setShowSecrets((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {showSecrets ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Salvas no Supabase (RLS por usuario). O app Android le essas mesmas credenciais.
          </p>
          <div className="space-y-2 mb-3">
            {PLATFORM_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-[11px] text-slate-400 mb-1">{f.label}</label>
                <input
                  type={showSecrets ? "text" : f.type}
                  value={platformSettings[f.key] ?? ""}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/50 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-blue-500/40 font-mono"
                  placeholder={f.label}
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSavePlatform}
            disabled={savingPlatform}
            className="px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500/80 disabled:opacity-50 rounded-xl text-sm font-medium text-white"
          >
            {savingPlatform ? "Salvando..." : "Salvar credenciais"}
          </button>
          {platformMsg && (
            <p className="text-xs text-slate-400 mt-2">{platformMsg}</p>
          )}
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={() => {
              // So grava o caminho dos cursos se ele realmente mudou — evita o
              // erro de validacao quando o usuario so trocou o tema.
              if (coursesPath && coursesPath !== initialPath) onSave(coursesPath);
              onCancel();
            }}
            className="flex-1 px-4 py-2.5 bg-blue-600/90 hover:bg-blue-500/90 rounded-xl text-sm font-medium transition-all text-white"
          >
            Salvar
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl text-sm text-slate-300 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;
