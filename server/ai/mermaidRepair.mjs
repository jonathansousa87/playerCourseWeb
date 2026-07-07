// Validacao + reparo automatico de diagramas Mermaid no material JA gerado, ANTES
// de salvar. Escopo deliberado: so conserta diagramas que QUEBRAM a renderizacao
// (cabecalho invalido, delimitadores/aspas desbalanceados) — ganho puro, sem risco de
// perder conteudo. Violacoes de QUALIDADE (>8 nos, shape errado por tipo) NAO sao
// consertadas aqui (mexer nisso via LLM pode descartar informacao): essas ficam a
// cargo da regra do prompt + do SELF_CHECK_BLOCK. Reusa o FIX_DIAGRAM ja existente
// (mesmo usado pelo botao "Regenerar" do viewer) — fonte unica de correcao de diagrama.
// So chama o DeepSeek para os blocos que FALHAM a validacao (custo ~zero no caso comum).

import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { FIX_DIAGRAM_SYSTEM, buildFixDiagramPrompt } from './prompts.js';

export const mermaidRepairEnabled = () => /^(1|true|yes|on)$/i.test((process.env.MERMAID_REPAIR_ENABLED || '').trim());

const VALID_HEAD = /^(flowchart|graph|classDiagram|mindmap|sequenceDiagram|erDiagram|stateDiagram(?:-v2)?|gantt|pie|journey|gitGraph)\b/m;

// Extrai o corpo de dentro de um bloco ```mermaid ... ``` (ou aceita cru).
const extractMermaid = (raw) => {
  const fenced = raw.match(/```mermaid\s*\n([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw.replace(/^```[a-z]*\s*\n?/i, '').replace(/```\s*$/i, '');
  return body.replace(/\s+$/, '').trim();
};

// Retorna a lista de problemas de RENDERIZACAO (vazia = valido). Ignora o texto
// dentro de aspas ao contar delimitadores (labels podem conter [ ] ( ) legitimamente).
export const findMermaidIssues = (code) => {
  const issues = [];
  const body = (code || '').trim();
  if (!body) { issues.push('diagrama vazio'); return issues; }
  if (!VALID_HEAD.test(body)) issues.push('cabecalho de diagrama invalido ou ausente');
  // Remove conteudo entre aspas antes de contar delimitadores estruturais.
  const structural = body.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  for (const [open, close] of [['[', ']'], ['(', ')'], ['{', '}']]) {
    const no = (structural.split(open).length - 1);
    const nc = (structural.split(close).length - 1);
    if (no !== nc) issues.push(`delimitadores desbalanceados: "${open}"=${no} "${close}"=${nc}`);
  }
  if ((body.match(/"/g) || []).length % 2 !== 0) issues.push('numero impar de aspas');
  return issues;
};

// Varre o markdown, valida cada bloco ```mermaid e conserta SO os quebrados via
// FIX_DIAGRAM. Se o conserto nao validar, mantem o original (nunca piora). Retorna
// { markdown, cost, repaired, checked, failed }.
export const repairMarkdownMermaid = async (markdown, { lessonTitle = '', model = DEFAULT_MODEL, instruction = '' } = {}) => {
  if (!markdown || !markdown.includes('```mermaid')) {
    return { markdown, cost: 0, repaired: 0, checked: 0, failed: 0 };
  }
  const re = /```mermaid\s*\n[\s\S]*?```/gi;
  const blocks = markdown.match(re) || [];
  let out = markdown;
  let cost = 0, repaired = 0, checked = 0, failed = 0;

  for (const block of blocks) {
    checked++;
    const orig = extractMermaid(block);
    if (!findMermaidIssues(orig).length) continue; // valido -> nao gasta chamada

    try {
      const { content, usage } = await chatCompletion({
        system: FIX_DIAGRAM_SYSTEM,
        user: buildFixDiagramPrompt({ lessonTitle, diagram: orig, instruction }),
        model,
        temperature: 0.2,
        maxTokens: 2000,
      });
      cost += costFromUsage(usage, model);
      const fixed = extractMermaid(content);
      if (fixed && !findMermaidIssues(fixed).length) {
        out = out.replace(block, '```mermaid\n' + fixed + '\n```');
        repaired++;
      } else {
        failed++;
      }
    } catch {
      failed++; // deixa o original; nao derruba a geracao por causa de um diagrama
    }
  }
  return { markdown: out, cost, repaired, checked, failed };
};
