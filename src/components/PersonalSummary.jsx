// Resumo pessoal estruturado (Fiorella & Mayer 2016 - generative learning).
// Em vez de campo livre unico, 4 prompts especificos forcam reflexao mais
// rica (g ~ 0.55, comparavel ao testing effect). Ha tambem um campo livre
// "Outras notas" pro que nao se encaixa nos 4.

import React, { useState, useEffect, useRef } from "react";
import { Save, CheckCircle, Lightbulb } from "lucide-react";
import { fetchPersonalNote, savePersonalNote } from "../utils/progressApi";
import { LoadingState } from "./StateViews";

// Chaves persistidas em personal_notes.prompts (JSONB).
const PROMPT_FIELDS = [
  {
    key: "answered",
    label: "O que essa aula respondeu?",
    helper: "Em 1-3 frases, qual pergunta a aula respondeu?",
    placeholder: "Ex: Como o FSRS calcula o proximo intervalo de revisao...",
    minRows: 3,
  },
  {
    key: "connections",
    label: "Como isso conecta com o que voce ja sabia?",
    helper: "Aulas anteriores, projetos, conceitos relacionados.",
    placeholder: "Ex: Lembrei do SM-2 que aprendi semana passada — FSRS substitui...",
    minRows: 3,
  },
  {
    key: "example",
    label: "De um exemplo seu (nao copiado da aula)",
    helper: "Aplicacao concreta, codigo, situacao do seu dia a dia. Forca elaboracao.",
    placeholder: "Ex: No meu projeto X, eu poderia usar isso pra...",
    minRows: 3,
  },
  {
    key: "unclear",
    label: "O que ainda nao esta claro?",
    helper: "Duvidas, partes que voce releu ou pulou. Vira material pro chat IA.",
    placeholder: "Ex: nao entendi como o stability eh atualizado quando o rating eh Hard...",
    minRows: 2,
  },
];

const emptyPrompts = () =>
  Object.fromEntries(PROMPT_FIELDS.map((f) => [f.key, ""]));

const PersonalSummary = ({ courseTitle, lessonPrefix, onMarkComplete, isCompleted }) => {
  const [prompts, setPrompts] = useState(emptyPrompts);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef(null);

  // Carrega resumo existente — preferencia: se ja tem prompts no DB, usa.
  // Se nao tem (legacy), prompts ficam vazios e o conteudo vai pro campo livre.
  useEffect(() => {
    if (!courseTitle || !lessonPrefix) return;
    setLoading(true);
    fetchPersonalNote(courseTitle, lessonPrefix)
      .then((data) => {
        const merged = { ...emptyPrompts(), ...(data.prompts || {}) };
        setPrompts(merged);
        setContent(data.content || "");
      })
      .catch(() => {
        setPrompts(emptyPrompts());
        setContent("");
      })
      .finally(() => setLoading(false));
  }, [courseTitle, lessonPrefix]);

  // Auto-save apos 2s de inatividade. So salva se houver alguma resposta
  // (qualquer prompt preenchido ou content nao-vazio).
  useEffect(() => {
    if (loading) return;
    const hasAnything =
      Object.values(prompts).some((v) => v.trim().length > 0) ||
      content.trim().length > 0;
    if (!hasAnything) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => persist(true), 2000);
    return () => clearTimeout(saveTimeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts, content, loading]);

  const persist = async (silent = false) => {
    if (!silent) setSaving(true);
    try {
      await savePersonalNote(courseTitle, lessonPrefix, { content, prompts });
      if (!silent) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error("Erro ao salvar resumo pessoal:", e);
    }
    if (!silent) setSaving(false);
  };

  const setPromptValue = (key, value) => {
    setPrompts((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const totalWords = [
    ...Object.values(prompts),
    content,
  ]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-4 lg:px-8 py-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-1 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-orange-300" />
              Resumo Pessoal estruturado
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Responda com suas proprias palavras. Self-explanation com prompts especificos
              consolida o aprendizado em ~55% acima da media (Fiorella & Mayer 2016).
            </p>
          </div>

          <div className="space-y-5">
            {PROMPT_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block mb-1.5">
                  <span className="text-slate-200 font-medium text-sm">{field.label}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{field.helper}</span>
                </label>
                <textarea
                  value={prompts[field.key] || ""}
                  onChange={(e) => setPromptValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={field.minRows}
                  className="w-full bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/40 focus:ring-1 focus:ring-orange-500/20 resize-y text-sm leading-relaxed"
                />
              </div>
            ))}

            <div className="pt-2 border-t border-slate-800/60">
              <label className="block mb-1.5">
                <span className="text-slate-200 font-medium text-sm">Outras notas (livre)</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Tudo que nao se encaixa nos campos acima. Codigo, links, esbocos.
                </span>
              </label>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setSaved(false);
                }}
                placeholder=""
                rows={4}
                className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 resize-y text-sm leading-relaxed font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800/60 bg-slate-900/80 backdrop-blur-sm px-6 lg:px-10 py-3 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {totalWords > 0 ? `${totalWords} palavras` : "Nenhuma nota ainda"}
          {saved && <span className="ml-2 text-emerald-400">Salvo automaticamente</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => persist(false)}
            disabled={saving || totalWords === 0}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              saved
                ? "bg-emerald-600/80 text-white"
                : "bg-blue-600/80 hover:bg-blue-500/80 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            {saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
          </button>
          <button
            onClick={() => onMarkComplete("pessoal")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              isCompleted
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                : "bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border border-slate-600/30"
            }`}
          >
            {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-current inline-block" />}
            {isCompleted ? "Concluido" : "Concluir"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonalSummary;
