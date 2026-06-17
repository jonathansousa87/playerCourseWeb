// Gera um "curso de leitura" a partir das transcricoes de um curso em video.
// Para cada modulo: (1) a IA decide o agrupamento das aulas, (2) a IA condensa
// cada grupo num texto de leitura limpo, gravado como .txt no novo curso.
// O .txt resultante alimenta depois o pipeline normal (resumo/exemplos/quiz...).
//
// Roda SOMENTE em modo filesystem (precisa escrever arquivos em disco).

import { promises as fs } from 'fs';
import { join } from 'path';
import { chatCompletion, DEFAULT_MODEL } from './deepseek.js';
import { parseTranscript } from './generator.js';
import { query } from '../../db/index.js';
import {
  READING_PLAN_SYSTEM,
  buildReadingPlanPrompt,
  READING_CONDENSE_SYSTEM,
  buildReadingCondensePrompt,
} from './prompts.js';

// Mesmo padrao usado pelo findTranscript: _dub[.locale].(txt|vtt)
const TRANSCRIPT_RE = /_dub(?:\.[a-z]{2,3}(?:-[a-zA-Z]{2,4})?)?\.(txt|vtt)$/i;
// Materiais gerados que terminam em .txt (flashcards) NAO sao transcricao.
const MATERIAL_TXT_RE = /_(?:flashcards_anki|resumo|exemplos|quiz|diario_tecnico)_dub_\d+/i;

const lessonTitleFromFile = (name) => name.replace(TRANSCRIPT_RE, '').trim();

// Remove caracteres invalidos pra nome de arquivo/pasta.
const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

// Remove "12. " / "12) " do inicio do titulo do modulo.
const cleanModuleTitle = (title) => title.replace(/^\s*\d+\s*[.)-]\s*/, '').trim();

// Remove numero do inicio do titulo da aula (evita "01 1. Introducao").
const cleanLessonTitle = (title) => title.replace(/^\s*\d+\s*[.)-]\s*/, '').trim() || title;

const pad2 = (n) => String(n).padStart(2, '0');

// Roda fn sobre items com no maximo `limit` em paralelo, preservando a ordem.
const mapPool = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
};

// Coleta as transcricoes de um modulo (recursivo), na ordem alfanumerica.
const collectModuleTranscripts = async (moduleDir) => {
  const found = [];
  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (TRANSCRIPT_RE.test(e.name) && !MATERIAL_TXT_RE.test(e.name)) {
        found.push({ name: e.name, path: full, title: lessonTitleFromFile(e.name) });
      }
    }
  };
  await walk(moduleDir);
  found.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }),
  );
  return found.map((t, id) => ({ id, ...t }));
};

// Fase 1: a IA decide o agrupamento. Fallback robusto = cada aula isolada.
const planGrouping = async ({ moduleTitle, transcripts, model }) => {
  const fallback = () =>
    transcripts.map((t) => ({ title: t.title, sources: [t.id] }));

  if (transcripts.length <= 1) return fallback();

  try {
    const { content } = await chatCompletion({
      system: READING_PLAN_SYSTEM,
      user: buildReadingPlanPrompt({
        moduleTitle,
        lessons: transcripts.map((t) => ({ id: t.id, title: t.title })),
      }),
      model,
      temperature: 0.2,
      maxTokens: 2000,
      responseFormat: { type: 'json_object' },
    });
    const parsed = JSON.parse(content);
    const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : [];
    // Valida: ids reais, cobertura total, sem duplicar.
    const validIds = new Set(transcripts.map((t) => t.id));
    const seen = new Set();
    const plan = [];
    for (const l of lessons) {
      const sources = (Array.isArray(l.sources) ? l.sources : [])
        .map(Number)
        .filter((id) => validIds.has(id) && !seen.has(id));
      if (sources.length === 0) continue;
      sources.forEach((id) => seen.add(id));
      const title = (l.title || '').trim() || transcripts[sources[0]].title;
      plan.push({ title, sources });
    }
    // Garante cobertura: aulas que a IA esqueceu entram isoladas.
    for (const t of transcripts) {
      if (!seen.has(t.id)) plan.push({ title: t.title, sources: [t.id] });
    }
    return plan.length ? plan : fallback();
  } catch {
    return fallback();
  }
};

// Fase 2: condensa as transcricoes de um grupo num texto de leitura.
const condenseLesson = async ({ lessonTitle, sources, model }) => {
  const parts = [];
  for (const src of sources) {
    try {
      parts.push(await parseTranscript(src.path));
    } catch {
      /* ignora transcricao ilegivel */
    }
  }
  const merged = parts.filter(Boolean).join('\n\n');
  if (merged.length < 40) return null;

  const { content, usage, model: usedModel } = await chatCompletion({
    system: READING_CONDENSE_SYSTEM,
    user: buildReadingCondensePrompt({ lessonTitle, transcript: merged }),
    model,
    temperature: 0.3,
    maxTokens: 8000,
  });
  return { text: content.trim(), usage, model: usedModel };
};

// Gera o curso de leitura para UM modulo. Retorna o manifesto do que foi criado.
// modulePath e relativo a raiz do curso (ex.: "24. [SQL Server] Procedures").
export const generateReadingModule = async ({
  coursesPath,
  courseTitle,
  modulePath,
  moduleTitle,
  index = 1,
  model = DEFAULT_MODEL,
}) => {
  const moduleDir = join(coursesPath, courseTitle, modulePath);
  const transcripts = await collectModuleTranscripts(moduleDir);
  if (transcripts.length === 0) {
    return { module: moduleTitle, skipped: 'sem transcricoes', created: [] };
  }

  const plan = await planGrouping({ moduleTitle, transcripts, model });

  const outRoot = join(coursesPath, `${courseTitle} - Leitura`);
  const outDir = join(outRoot, `${pad2(index)} ${safeName(cleanModuleTitle(moduleTitle))}`);
  await fs.mkdir(outDir, { recursive: true });

  // Re-rodar deve ser idempotente: remove os .txt antigos do modulo pra nao
  // acumular aulas orfas (o planejador da IA pode mudar o agrupamento).
  try {
    for (const f of await fs.readdir(outDir)) {
      if (TRANSCRIPT_RE.test(f)) await fs.unlink(join(outDir, f));
    }
  } catch { /* pasta nova, nada a limpar */ }

  // Condensa as aulas planejadas em paralelo (ate 4 por vez). A ordem do
  // arquivo (NN) segue a posicao no plano, nao a de conclusao.
  const created = await mapPool(plan, 4, async (lesson, idx) => {
    const title = cleanLessonTitle(lesson.title);
    const sources = lesson.sources.map((id) => transcripts[id]).filter(Boolean);
    try {
      const out = await condenseLesson({ lessonTitle: title, sources, model });
      if (!out) return { title, ok: false, error: 'transcricao vazia' };

      const fileTitle = `${pad2(idx + 1)} ${safeName(title)}`;
      const fileName = `${fileTitle}_dub.txt`;
      await fs.writeFile(join(outDir, fileName), out.text, 'utf8');

      // Grava a aula de leitura tambem como material "resumo" no banco (keyed
      // por course_title + lesson_prefix, igual ao pipeline normal), pra render
      // rico direto, sem depender do prompt generico de resumo. O lesson_prefix
      // bate com o que a descoberta gera pra a transcricao (nome sem _dub.txt).
      try {
        await query(
          `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
           VALUES ($1, $2, 'resumo', $3)
           ON CONFLICT (course_title, lesson_prefix, kind)
           DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
          [`${courseTitle} - Leitura`, fileTitle, out.text],
        );
      } catch {
        // Se o banco falhar, o .txt ainda permite gerar o resumo via "Gerar IA".
      }

      return {
        title,
        file: fileName,
        sources: sources.map((s) => s.title),
        ok: true,
        usage: out.usage,
      };
    } catch (err) {
      return { title, ok: false, error: err.message };
    }
  });

  return { module: moduleTitle, outDir, created };
};
