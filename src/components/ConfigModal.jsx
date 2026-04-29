import React, { useState } from "react";
import { migrateLocalStorage } from "../utils/progressApi";

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
  const [migrating, setMigrating] = useState(false);
  const [migrationMsg, setMigrationMsg] = useState("");

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-100 mb-4">Configuracoes</h2>

        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-300 mb-2">
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

        <div className="flex gap-2.5">
          <button
            onClick={() => onSave(coursesPath)}
            className="flex-1 px-4 py-2.5 bg-blue-600/90 hover:bg-blue-500/90 rounded-xl text-sm font-medium transition-all text-white"
          >
            Salvar
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl text-sm text-slate-300 transition-all"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;
