// SPIKE — ETAPA 1 (extracao do Canonical Lesson JSON) rodando no QWEN LOCAL em vez
// do DeepSeek. Objetivo: medir se o modelo local (Qwen3.5-9B, llama-server) e capaz
// de executar essa chamada com qualidade equivalente, pra tirar a extracao do
// DeepSeek e baratear o pipeline de leitura em 2 etapas (~1,4x hoje).
//
// Usa o MESMO prompt de producao (READING_EXTRACT_SYSTEM + buildReadingExtractFactsPrompt,
// prompts.js) — nao duplica regra nenhuma. So troca ONDE a chamada roda. Nao mexe em
// producao (server/ai/readingCourse.js continua chamando o DeepSeek).
//
// Uso:
//   node server/ai/spikeExtractLocal.mjs --transcript "<caminho .txt|.vtt>" --title "..."
//   node server/ai/spikeExtractLocal.mjs --transcript "..." --title "..." --compare
// Flags: --instruction "..."  --lang pt|en  --out <dir>  --maxtokens 8000  --compare (roda DeepSeek tambem, pra comparar)

import '../load-env.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { parseTranscript } from './generator.js';
import { READING_EXTRACT_SYSTEM, buildReadingExtractFactsPrompt } from './prompts.js';
import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { startQwen, isQwenUp } from './qwenServer.js';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);

const LOCAL_URL = (process.env.PRECONDENSE_URL || 'http://127.0.0.1:8080/v1/chat/completions').trim();
const LOCAL_MODEL = (process.env.PRECONDENSE_MODEL || 'local').trim();

// Chamada OpenAI-compatible ao llama-server local. Sem response_format (o build
// atual do llama.cpp usado pelo start.sh nao garante grammar JSON); a producao ja
// se apoia so na instrucao "Output PURE JSON only" pro Qwen (ver precondense.js).
const callLocal = async ({ system, user, maxTokens, temperature = 0 }) => {
  const t0 = Date.now();
  const res = await fetch(LOCAL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`local HTTP ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`);
  }
  const data = await res.json();
  const content = (data?.choices?.[0]?.message?.content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // reasoning off, mas remove se vazar
    .trim();
  return { content, usage: data.usage || null, ms: Date.now() - t0 };
};

// Extrai o primeiro objeto JSON valido de uma string (tolera fences/preambulo que
// o modelo local, menos disciplinado que o DeepSeek, possa deixar escapar).
const extractJson = (raw) => {
  let s = raw.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try { return { json: JSON.parse(s), clean: s }; } catch { /* tenta recortar */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const cut = s.slice(start, end + 1);
    try { return { json: JSON.parse(cut), clean: cut }; } catch { /* falhou mesmo */ }
  }
  return { json: null, clean: s };
};

const REQUIRED_KEYS = [
  'title', 'lesson_type', 'one_line_summary', 'learning_objectives', 'prerequisites',
  'core_concepts', 'terminology', 'code_examples', 'steps', 'pitfalls', 'best_practices', 'diagrams',
];

const audit = (json) => {
  if (!json) return { valid: false, missingKeys: REQUIRED_KEYS, counts: {} };
  const missingKeys = REQUIRED_KEYS.filter((k) => !(k in json));
  const counts = {
    core_concepts: json.core_concepts?.length ?? 0,
    terminology: json.terminology?.length ?? 0,
    code_examples: json.code_examples?.length ?? 0,
    steps: json.steps?.length ?? 0,
    pitfalls: json.pitfalls?.length ?? 0,
    best_practices: json.best_practices?.length ?? 0,
    diagrams: json.diagrams?.length ?? 0,
  };
  // Checagens de qualidade baratas (nao substituem leitura humana do JSON):
  const codeWithoutLanguage = (json.code_examples || []).filter((c) => !c.language).length;
  const stepsWithoutWhyNow = (json.steps || []).filter((s) => !s.why_now).length;
  return { valid: missingKeys.length === 0, missingKeys, counts, codeWithoutLanguage, stepsWithoutWhyNow };
};

const run = async () => {
  const title = arg('title');
  if (!title) throw new Error('--title obrigatorio');
  const transcriptPath = arg('transcript');
  if (!transcriptPath) throw new Error('--transcript obrigatorio (caminho .txt ou .vtt)');
  const instruction = arg('instruction', '');
  const sourceLanguage = arg('lang', 'pt');
  const maxTokens = parseInt(arg('maxtokens', '8000'), 10);
  const outDir = resolve(arg('out', join('docs', 'spike-out')));
  const compare = flag('compare');

  const transcript = await parseTranscript(transcriptPath);
  await mkdir(outDir, { recursive: true });

  console.log(`[spike] titulo="${title}"`);
  console.log(`[spike] transcricao=${transcriptPath} (${transcript.length} chars)`);
  console.log(`[spike] modelo local=${LOCAL_MODEL} @ ${LOCAL_URL}  maxTokens=${maxTokens}`);

  const system = READING_EXTRACT_SYSTEM;
  const user = buildReadingExtractFactsPrompt({ lessonTitle: title, transcript, instruction, sourceLanguage, canonicalNames: '' });
  console.log(`[spike] prompt: ${(system.length + user.length)} chars (~${Math.round((system.length + user.length) / 3.7)} tokens estimados)`);

  if (!(await isQwenUp())) {
    console.log('[spike] Qwen local fora do ar, subindo...');
    await startQwen({ log: (m) => console.log(m) });
  }

  process.stdout.write('[spike] chamando o Qwen local... ');
  const local = await callLocal({ system, user, maxTokens });
  console.log(`ok (${local.ms}ms, ${local.usage?.completion_tokens ?? '?'} tok saida)`);
  const { json: localJson, clean: localClean } = extractJson(local.content);
  const localAudit = audit(localJson);

  await writeFile(join(outDir, 'LOCAL_facts.json'), localClean, 'utf8');
  await writeFile(join(outDir, 'LOCAL_facts.raw.txt'), local.content, 'utf8');

  let deep = null, deepJson = null, deepAudit = null;
  if (compare) {
    process.stdout.write('[spike] chamando o DeepSeek (baseline)... ');
    const t0 = Date.now();
    deep = await chatCompletion({ system, user, model: DEFAULT_MODEL, temperature: 0, maxTokens: 14000 });
    deep.ms = Date.now() - t0;
    const cost = costFromUsage(deep.usage, deep.model);
    console.log(`ok (${deep.ms}ms, ${deep.usage?.completion_tokens ?? '?'} tok saida, $${cost.toFixed(5)})`);
    const ext = extractJson(deep.content);
    deepJson = ext.json;
    deepAudit = audit(deepJson);
    await writeFile(join(outDir, 'DEEPSEEK_facts.json'), ext.clean, 'utf8');
  }

  const fmtAudit = (label, a, ms) => `## ${label}
- JSON valido: ${a.valid ? 'SIM' : 'NAO'}${a.missingKeys?.length ? ` (faltando: ${a.missingKeys.join(', ')})` : ''}
- Tempo: ${ms}ms
- core_concepts: ${a.counts.core_concepts ?? '-'}  |  terminology: ${a.counts.terminology ?? '-'}  |  code_examples: ${a.counts.code_examples ?? '-'}
- steps: ${a.counts.steps ?? '-'}  |  pitfalls: ${a.counts.pitfalls ?? '-'}  |  best_practices: ${a.counts.best_practices ?? '-'}  |  diagrams: ${a.counts.diagrams ?? '-'}
- code_examples sem "language": ${a.codeWithoutLanguage ?? '-'}
- steps sem "why_now": ${a.stepsWithoutWhyNow ?? '-'}
`;

  let report = `# Spike — extracao (Etapa 1) no Qwen local\n\nAula: ${title}\nTranscricao: ${transcriptPath} (${transcript.length} chars)\n\n`;
  report += fmtAudit('LOCAL (Qwen)', localAudit, local.ms);
  if (compare) report += `\n${fmtAudit('DEEPSEEK (baseline)', deepAudit, deep.ms)}`;
  report += `\nArquivos: LOCAL_facts.json${compare ? ', DEEPSEEK_facts.json' : ''} — leia os dois e compare a QUALIDADE do conteudo (nao so contagem): fidelidade, completude, se o codigo esta correto, se nao inventou nada.\n`;

  await writeFile(join(outDir, 'REPORT.md'), report, 'utf8');

  console.log(`\n${report}`);
  console.log(`[spike] pronto -> ${outDir}`);
  console.log('[spike] producao (readingCourse.js) NAO foi alterada — a extracao real continua no DeepSeek.');
};

run().catch((e) => { console.error('[spike] ERRO:', e.message); process.exit(1); });
