// Validacao + reparo automatico: todo ```mermaid da leitura tem que vir seguido de
// prosa explicando ele (regra do prompt, ver buildReadingWriteDidacticPrompt). Isso
// e uma INSTRUCAO de prompt — reforcada aqui como GARANTIA de codigo, no mesmo
// espirito do mermaidRepair.mjs: detector puro JS (gratis) + so chama o DeepSeek
// pros diagramas que REALMENTE violam a regra (custo ~zero no caso comum, que e o
// modelo ja seguir a instrucao). Insere a explicacao que falta; nunca remove nada.

import { chatCompletion, DEFAULT_MODEL, costFromUsage } from './deepseek.js';
import { EXPLAIN_DIAGRAM_SYSTEM, buildExplainDiagramPrompt } from './prompts.js';

export const diagramExplanationRepairEnabled = () => /^(1|true|yes|on)$/i.test((process.env.DIAGRAM_EXPLANATION_ENABLED || '').trim());

const MERMAID_RE = /```mermaid\s*\n([\s\S]*?)```/gi;
// Explicacao valida = paragrafo de prosa (nao heading/fence/tabela) com pelo menos
// ~40 chars de texto de verdade logo apos o fechamento do bloco. Olha o PARAGRAFO
// inteiro (ate a 1a linha em branco), nao so a 1a linha — um lead-in curto em negrito
// tipo "**Explicação do diagrama:**" (real, visto em teste) e so um rotulo, nao a
// explicacao; sem isso disparava reparo redundante mesmo com prosa de verdade logo
// na linha seguinte.
const isProseExplanation = (chunk) => {
  const t = (chunk || '').trimStart();
  if (!t) return false;
  const lines = t.split('\n');
  const firstLine = lines[0].trim();
  if (!firstLine) return false;
  if (/^#{1,6}\s/.test(firstLine)) return false; // heading -> nao e explicacao
  if (/^```/.test(firstLine)) return false; // outro bloco de codigo/mermaid direto
  if (/^\|/.test(firstLine)) return false; // tabela direto
  // Acumula ate a 1a linha em branco (fim do paragrafo) ou heading/fence/tabela seguinte.
  let paragraph = '';
  for (const line of lines) {
    const l = line.trim();
    if (!l) break;
    if (paragraph && (/^#{1,6}\s/.test(l) || /^```/.test(l) || /^\|/.test(l))) break;
    paragraph += (paragraph ? ' ' : '') + l.replace(/^>\s?/, '');
  }
  return paragraph.length >= 40;
};

// Varre o markdown, acha cada ```mermaid``` e verifica o que vem IMEDIATAMENTE depois
// (pulando so linhas em branco). Retorna { markdown, cost, checked, fixed, failed }.
export const repairMissingDiagramExplanations = async (markdown, { lessonTitle = '', model = DEFAULT_MODEL } = {}) => {
  if (!markdown || !markdown.includes('```mermaid')) {
    return { markdown, cost: 0, checked: 0, fixed: 0, failed: 0 };
  }
  let out = markdown;
  let cost = 0, checked = 0, fixed = 0, failed = 0;
  let offset = 0; // desloca os indices conforme insercoes mudam o tamanho do texto

  const matches = [...markdown.matchAll(MERMAID_RE)];
  for (const m of matches) {
    checked += 1;
    const blockEnd = m.index + m[0].length;
    const afterTrimmed = markdown.slice(blockEnd).replace(/^(\s*\n)+/, '');
    if (isProseExplanation(afterTrimmed)) continue; // ja tem explicacao -> nao gasta chamada

    const diagramMermaid = m[1].trim();
    const precedingContext = markdown.slice(Math.max(0, m.index - 400), m.index).trim();
    try {
      const { content, usage } = await chatCompletion({
        system: EXPLAIN_DIAGRAM_SYSTEM,
        user: buildExplainDiagramPrompt({ lessonTitle, diagramMermaid, precedingContext }),
        model,
        temperature: 0.3,
        maxTokens: 800,
      });
      cost += costFromUsage(usage, model);
      const explanation = content.trim();
      if (explanation) {
        const insertAt = blockEnd + offset;
        out = `${out.slice(0, insertAt)}\n\n${explanation}\n${out.slice(insertAt)}`;
        offset += explanation.length + 3; // "\n\n" + texto + "\n"
        fixed += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1; // deixa sem explicacao; nao derruba a geracao por causa disso
    }
  }
  return { markdown: out, cost, checked, fixed, failed };
};
