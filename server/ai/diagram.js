// Regenera UM unico diagrama Mermaid de um material (a leitura/resumo), sem
// recondensar a aula inteira. Pega o bloco atual (possivelmente quebrado), pede
// pro DeepSeek devolver UM bloco corrigido, troca no conteudo salvo e devolve o
// novo diagrama + o custo. Barato: ~poucos tokens vs. "Gerar IA" da aula toda.

import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { FIX_DIAGRAM_SYSTEM, buildFixDiagramPrompt } from './prompts.js';
import { query } from '../../db/index.js';

// Extrai o codigo de dentro de um bloco ```mermaid ... ``` (ou aceita cru).
const extractMermaid = (raw) => {
  const fenced = raw.match(/```mermaid\s*\n([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw.replace(/^```[a-z]*\s*\n?/i, '').replace(/```\s*$/i, '');
  return body.replace(/\s+$/, '').trim();
};

const VALID_HEAD = /^(flowchart|graph|classDiagram|mindmap|sequenceDiagram|erDiagram|stateDiagram)/m;

export const regenerateLessonDiagram = async ({
  courseTitle,
  lessonPrefix,
  kind = 'resumo',
  chart,
  model = DEFAULT_MODEL,
  instruction = '',
}) => {
  const orig = chart || '';
  if (!orig.trim()) { const e = new Error('diagrama vazio'); e.code = 'BAD_INPUT'; throw e; }

  // O viewer le o material do banco (lesson_materials). Ele e a fonte da verdade.
  const rows = await query(
    'SELECT content FROM lesson_materials WHERE course_title = $1 AND lesson_prefix = $2 AND kind = $3',
    [courseTitle, lessonPrefix, kind],
  );
  const content = rows.rows[0]?.content;
  if (!content) { const e = new Error('material nao encontrado'); e.code = 'NOT_FOUND'; throw e; }
  if (!content.includes(orig)) {
    const e = new Error('diagrama nao encontrado no material (pode ter sido editado)');
    e.code = 'DIAGRAM_NOT_FOUND';
    throw e;
  }

  const lessonTitle = lessonPrefix.replace(/^\d+\s*/, '').replace(/[-_]+/g, ' ').trim();
  const { content: out, usage } = await chatCompletion({
    system: FIX_DIAGRAM_SYSTEM,
    user: buildFixDiagramPrompt({ lessonTitle, diagram: orig, instruction }),
    model,
    temperature: 0.2,
    maxTokens: 2000,
  });

  const fixed = extractMermaid(out);
  if (!fixed || !VALID_HEAD.test(fixed)) {
    const e = new Error('o modelo nao retornou um diagrama valido'); e.code = 'BAD_OUTPUT'; throw e;
  }

  // Troca SO o bloco alvo (primeira ocorrencia) e persiste.
  const newContent = content.replace(orig, fixed);
  await query(
    'UPDATE lesson_materials SET content = $4, updated_at = NOW() WHERE course_title = $1 AND lesson_prefix = $2 AND kind = $3',
    [courseTitle, lessonPrefix, kind, newContent],
  );

  return { chart: fixed, cost: costFromUsage(usage, model) };
};
