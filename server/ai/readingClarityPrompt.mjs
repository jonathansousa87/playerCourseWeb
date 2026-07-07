// Prompt de CLAREZA do spike (fonte única, reusado pelos scripts de spike).
// Troca o bloco FIDELITY RULE do prompt de producao por um CLARITY RULE que ensina
// para iniciante como um tutor com tempo limitado (~10min): nucleo -> analogia ->
// exemplo que prova -> cada subtopico com exemplo -> "Fixando (teste-se)".
// Agnostico de nicho. NAO altera producao — vive so aqui, aplicado em memoria.

import { buildReadingCondensePrompt } from './prompts.js';

export const FIDELITY_BLOCK = `FIDELITY RULE (the most important):
- Your job is to EXPLAIN BETTER what is in the transcript — NOT to expand the content.
- Do NOT add commands, functions, resources, syntax, parameters or code examples that do NOT
  appear in the transcript. If the lesson did not mention it, it does NOT go in (even if you know
  it exists and is relevant).
- Code blocks must reflect what was shown in the lesson, not "improved" versions.
- The context/intro may situate the subject in general words, but without asserting new technical facts.
- When in doubt whether something was in the lesson: do NOT include it.`;

export const CLARITY_BLOCK = `CLARITY RULE (the most important) — you are a GREAT TUTOR with LIMITED TIME. The reader is a BEGINNER who
does NOT know the subject and is here to LEARN it and RETAIN it (fixar). This is a ~10-minute reading lesson:
make the reader FUNCTIONAL fast — no theory without an application, no filler, and clearly signal what is
ESSENTIAL vs secondary. NEVER assume the domain (programming, cooking, finance, design, music, law, medicine...);
adapt every example to whatever the lesson is about. SHOW, never just TELL.

MANDATORY STRUCTURE:
1. "## O núcleo (comece por aqui)" — the reader must FULLY understand the main idea from THIS section alone:
   a. The problem / "before": the naive or painful way, made concrete.
   b. The "after", right next to it: the way the lesson teaches, so the contrast is obvious.
   c. A one-sentence MENTAL MODEL ("frase-ancora") to memorize.
   d. A SIMPLE everyday ANALOGY for the concept (an analogy adds no new subject facts, so it is always safe).
2. "## Por que vale a pena (o exemplo que prova)" — DEMONSTRATE the benefit with a concrete WORKED example
   (before/after, a worked calculation, a step-by-step, a small case). Do NOT merely assert it.
3. EVERY OTHER topic and sub-topic (INCLUDING inside "Aprofundando") gets the SAME care, but CONCISE:
   1-2 sentences of "o que é / por que importa" + ONE concrete example. NEVER a bare mechanical mention;
   NEVER a benefit asserted without an example. Keep it TIGHT — ~10 minutes, not an encyclopedia: ONE clear
   example per sub-topic, not five. When a sub-topic is abstract, add a one-line analogy.
4. "## Aprofundando" (near the END) — the advanced / edge-case details the lesson covered; each STILL gets a
   brief explanation + one example, just shorter.
5. End with "## Fixando (teste-se)" — 2 to 4 short ACTIVE-RECALL questions the reader can answer FROM the
   lesson, to confirm real understanding and aid retention. Ask about the CORE idea and the "why", not trivia.

RULES:
- Keep FIDELITY to the SUBJECT: same topics the lesson taught; no NEW subjects.
- Explain the WHY before the HOW. Make the ESSENTIAL unmissable; keep the secondary short.
- Deep-and-clear beats broad-and-shallow — but every sub-topic still earns ONE concrete example.

CORRECTNESS (non-negotiable — a worked example that is wrong or would fail is a FAILURE):
- Every worked example (code, recipe, calculation, formula, step list, diagram) MUST be correct and
  self-consistent: if the reader follows it exactly, it has to actually work / compute / hold up.
- Use PRECISE terminology. Do NOT mislabel a concept — if you name a category, type or role for something,
  make sure it truly belongs to it.
- If an example is only valid under a condition, state that condition INSIDE the SAME example — never show
  an example that would fail as written and only fix it in a later block.

DIAGRAMS AND ORDER:
- "## O núcleo (comece por aqui)" MUST be the FIRST content section (only a 1-line "por que importa" intro
  may precede it). Any diagram comes AFTER the núcleo (or in "Aprofundando"), NEVER before it.`;

// Monta o prompt de condensacao com a regra de clareza no lugar da de fidelidade.
export const buildClarityPrompt = (args) => {
  const p = buildReadingCondensePrompt(args);
  const c = p.replace(FIDELITY_BLOCK, CLARITY_BLOCK);
  if (c === p) throw new Error('FIDELITY_BLOCK nao encontrado — o prompt de producao mudou; atualize readingClarityPrompt.mjs');
  return c;
};
