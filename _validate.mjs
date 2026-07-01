import { promises as fs } from 'fs';
try { const env = await fs.readFile('.env', 'utf8');
  for (const line of env.split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}
import { chatCompletion, DEFAULT_MODEL } from './server/ai/deepseek.js';
import { READING_PLAN_SYSTEM, buildReadingPlanPrompt } from './server/ai/prompts.js';

const TRANSCRIPT_RE = /_dub(?:\.[a-z]{2,3}(?:-[a-zA-Z]{2,4})?)?\.(txt|vtt)$/i;
const MATERIAL_TXT_RE = /_(?:flashcards_anki|resumo|exemplos|quiz|diario_tecnico)_dub_\d+/i;
const lessonTitleFromFile = (n) => n.replace(TRANSCRIPT_RE, '');
const lessonNum = (name) => { const m = name.match(/(?:^|[_ ])(\d+(?:\.\d+)+)/); return m ? m[1] : null; };
const baseNum = (n) => n.replace(/\.\d+$/, '');
const mergeComplements = (found) => {
  const nums = new Set(found.map((f) => lessonNum(f.name)).filter(Boolean));
  const byNum = new Map(); const logical = [];
  for (const f of found) { const num = lessonNum(f.name); const part = { name: f.name };
    if (num) { const base = baseNum(num);
      if (base !== num && base.includes('.') && nums.has(base) && byNum.has(base)) { byNum.get(base).parts.push(part); continue; } }
    const L = { title: f.title, parts: [part] }; logical.push(L); if (num) byNum.set(num, L); }
  return logical; };
const parseJsonLoose = (raw) => { if (!raw) return null;
  const c = raw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(c); } catch { const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(c.slice(a, b + 1)); } catch { return null; } } return null; } };

const dir = '/mnt/nvme2/kadabra/Downloads/cursos/Especialista Spring REST/18 - Documentação da API com OpenAPI, Swagger UI e SpringFox';
const moduleTitle = '18 - Documentação da API com OpenAPI, Swagger UI e SpringFox';
const names = (await fs.readdir(dir)).filter((n) => TRANSCRIPT_RE.test(n) && !MATERIAL_TXT_RE.test(n));
const found = names.map((n) => ({ name: n, title: lessonTitleFromFile(n) }))
  .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
const transcripts = mergeComplements(found).map((t, id) => ({ id, ...t, bytes: 0 }));
const userPrompt = buildReadingPlanPrompt({ moduleTitle, lessons: transcripts.map((t) => ({ id: t.id, title: t.title, bytes: 0 })) });

const max1 = Math.min(24000, 8000 + transcripts.length * 400);
console.log(`Aulas logicas: ${transcripts.length} | ETAPA 1 maxTokens=${max1}`);
const t0 = Date.now();
const { content, usage } = await chatCompletion({
  system: READING_PLAN_SYSTEM, user: userPrompt, model: DEFAULT_MODEL,
  temperature: 0.2, maxTokens: max1, responseFormat: { type: 'json_object' },
});
const parsed = parseJsonLoose(content);
const lessons = parsed?.lessons || [];
console.log(`tempo=${((Date.now()-t0)/1000).toFixed(1)}s | USAGE=${JSON.stringify(usage)}`);
console.log(`JSON valido? ${!!parsed} | grupos=${lessons.length}`);
console.log('tamanhos:', JSON.stringify(lessons.map((l) => l.sources?.length)));
console.log('\nPLANO:');
for (const l of lessons) console.log(`  [${(l.sources||[]).join(',')}] ${l.title}`);
