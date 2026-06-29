// Prompts for the generation pipeline. The INSTRUCTIONS are written in English
// (DeepSeek follows English instructions more consistently), but every prompt
// asks for OUTPUT in Brazilian Portuguese — the student reads the material in
// pt-BR. The visible output headers (## Pontos Principais, > Explicacao:, etc.)
// and the parser markers stay exactly as the front-end/parsers expect.
//
// All materials are plain Markdown — the platform handles the visuals. Formats:
// resumo .md, quiz .md, exemplos .md, flashcards .txt (Anki TSV), diario .md.

const SYSTEM_BASE =
  'You are an educational assistant that generates study material in BRAZILIAN PORTUGUESE ' +
  'from the transcript of a video lesson. Follow the requested format to the letter, ' +
  'with no commentary outside the format.';

const SYSTEM_PRATICA =
  'You are an instructor who creates PRACTICE/REINFORCEMENT material in BRAZILIAN PORTUGUESE, ' +
  'from the transcript of ONE lesson, always 100% about what it taught. If the lesson is ' +
  'hands-on (code, commands, tooling, step-by-step), focus on DOING and REPRODUCING. If it is ' +
  'purely theoretical, do NOT invent practice: reinforce the theory with active recall. ' +
  'Follow the format to the letter.';

export const SYSTEM_PROMPTS = {
  resumo: SYSTEM_BASE,
  quiz: SYSTEM_BASE,
  flashcards: SYSTEM_BASE,
  diario: SYSTEM_BASE,
  exemplos: SYSTEM_PRATICA,
  prequestions: SYSTEM_BASE,
  piada: SYSTEM_BASE,
};

const trunc = (text, max = 20000) =>
  text.length > max ? text.slice(0, max) + '\n\n[TRANSCRIPT TRUNCATED]' : text;

// User instruction block (niche/modernization) reused by every material. It has
// priority over literal fidelity, but must not change the lesson's subject.
const instructionBlock = (instruction) =>
  instruction && instruction.trim()
    ? `

ADDITIONAL INSTRUCTION (PRIORITY — apply it when generating this material; modernize the FORM:
versions, syntax, APIs, tools and best practices as requested. It outweighs literal fidelity
to the transcript, but do NOT change the lesson's subject matter/concepts):
"""
${instruction.trim()}
"""
`
    : '';

// Default Mermaid diagram styling: a classDef block that mirrors the FlowDiagram
// per-type palette (entity=slate, process=sky, store=violet, decision=amber,
// step=emerald). The AI pastes this block into the flowchart and tags each node
// with :::type. MermaidDiagram still normalizes the text contrast.
const MERMAID_CLASSDEF =
`  classDef entity fill:#1e293b,stroke:#94a3b8,stroke-width:2px,color:#e8eef6;
  classDef process fill:#0e2a3f,stroke:#38bdf8,stroke-width:2px,color:#e0f2fe;
  classDef store fill:#1f2937,stroke:#a78bfa,stroke-width:2px,color:#ede9fe;
  classDef decision fill:#3a2a0e,stroke:#fbbf24,stroke-width:2px,color:#fef3c7;
  classDef step fill:#0f2a22,stroke:#34d399,stroke-width:2px,color:#d1fae5;`;

// The platform's DEFAULT diagram = Mermaid (the AI emits Mermaid more reliably
// and the style now matches the FlowDiagram via classDef/theme). The ```flow
// format (React Flow/JSON) is still supported by the renderer, but it is not
// what the AI emits.
const MERMAID_FLOW_RULES =
`Include the diagram in a \`\`\`mermaid block using 'flowchart':
\`\`\`mermaid
flowchart TB
  A["Cliente"]:::entity --> B("Validar pedido"):::process
  B --> C{"Estoque ok?"}:::decision
  C -->|sim| D[("Banco")]:::store
  C -->|nao| E(["Notificar"]):::step
${MERMAID_CLASSDEF}
\`\`\`
Use it for FLOW/PROCESS/DFD/ARCHITECTURE/COMPONENTS (and simple relations between
services/components).
Rules (follow them ALL, otherwise it breaks or becomes unreadable):
- START with 'flowchart TB' (vertical) or 'flowchart LR' (horizontal).
- PASTE the classDef block above EXACTLY as it is (it defines the per-type colors). Do NOT change the colors.
- ALWAYS wrap the node text in DOUBLE QUOTES — quotes avoid syntax errors with
  ':', '@', '(', etc. (e.g. A["@Primary: bean unico"]). NEVER use quotes INSIDE the text.
- Each node carries the CLASS of its type (with ':::') and the matching SHAPE:
    entity   (actor/entity/class/component): A["Texto"]:::entity
    process  (action/process/service):       B("Texto"):::process
    store    (data/table/database):          D[("Texto")]:::store
    decision (decision):                     C{"Texto?"}:::decision
    step     (generic step):                 E(["Texto"]):::step
- MACRO: AT MOST 8 nodes. Short node labels (2-4 words).
- Edge with label: '-->|texto|' with AT MOST 2 words; or no label ('-->'). Never a full sentence.
- Define each node ONCE (with shape+class); afterwards reference it ONLY by id (A, B, C...).
- Node text: 2-4 words, no ';'. Accents are fine (they are inside quotes).`;

const MERMAID_MINDMAP_RULES =
`Include the mind map in a \`\`\`mermaid block using 'mindmap' (INDENTATION defines the hierarchy):
\`\`\`mermaid
mindmap
  root((Tema central))
    Ramo 1
      Detalhe
      Detalhe
    Ramo 2
      Detalhe
\`\`\`
Rules (STAR shape — shallow and wide, NEVER a deep tree):
- 1 root 'root((Tema))'; 4 to 7 direct branches; 1 to 3 leaves per branch. AT MOST 2 levels below the root.
- Use 2 spaces of indentation per level (root / branch / leaf). SHORT labels (1-4 words).
- ONLY the ROOT uses '((...))'; branches and leaves are plain text, WITHOUT parentheses/brackets/braces.`;

// UML CLASS diagram / DDD domain model.
const MERMAID_CLASSES_RULES =
`Include the diagram in a \`\`\`mermaid block using 'classDiagram':
\`\`\`mermaid
classDiagram
  class Pedido {
    +Long id
    +BigDecimal valorTotal
    +StatusPedido status
  }
  class ItemPedido {
    +Integer quantidade
    +BigDecimal precoUnitario
  }
  Pedido "1" *-- "*" ItemPedido : contem
  Pedido --> Restaurante : feito para
\`\`\`
Rules:
- SCOPE: the classDiagram is the DOMAIN MODEL — the ENTITIES with their ATTRIBUTES (e.g. FotoProduto,
  Produto). The application LAYERS (Controller/Service/Repository) and the request FLOW between
  them do NOT belong here: that becomes a separate FLOWCHART. If the lesson shows BOTH the
  architecture AND the entities, generate BOTH (an architecture/flow flowchart + this entity classDiagram).
- Each 'class Nome { ... }' with 2 to 6 attributes in the form '+Tipo nome'. Only what the lesson showed (do not invent).
- SHORT MEMBERS (the classDiagram does NOT wrap lines — a long signature overflows the box width):
  methods with ONLY the name and EMPTY/summarized parameters (e.g. '+salvar()'), NEVER a long signature
  like '+ResponseEntity atualizarFoto(Long restauranteId, Long produtoId, ... arquivo)'. Few
  methods (0 to 4); parameter detail belongs in the code, not in the diagram.
- Relations: inheritance 'A <|-- B'; composition 'A *-- B'; aggregation 'A o-- B'; association 'A --> B'.
  Multiplicity in quotes and a short label after ' : '. E.g. 'Pedido "1" *-- "*" Item : contem'.
- AT MOST 8 classes (only the core of the domain). Class names WITHOUT spaces.`;

export const buildResumoPrompt = ({ lessonTitle, transcript, instruction }) => `
Generate a structured summary in Markdown of the lesson below. Write the summary in BRAZILIAN
PORTUGUESE.${instructionBlock(instruction)}

Mandatory format (keep the headers EXACTLY as written, in Portuguese):

## Pontos Principais
*   (4 a 6 bullets curtos com as ideias-chave)

## Detalhes por topico
### <nome do topico>
*   (3 a 6 bullets com detalhes)

### <outro topico>
*   ...

## Conclusao
(1 paragrafo de 2-4 frases sintetizando o que o aluno deve levar dessa aula)

Use **bold** to highlight technical terms. Do NOT cite timestamps. Do NOT invent facts that are
not in the transcript.

Lesson title: ${lessonTitle}

Transcript:
---
${trunc(transcript)}
---`.trim();

export const buildFlashcardsPrompt = ({ lessonTitle, transcript, instruction }) => {
  // Example with a real TAB separator (ASCII char 9)
  const TAB = '\t';
  return `
Generate flashcards in importable Anki format (tab-separated) from the lesson below. Write the
card text in BRAZILIAN PORTUGUESE.${instructionBlock(instruction)}

Mandatory format (EXACT, no deviations):
- Line 1: #separator:tab
- Line 2: #html:true
- Then, 10 to 18 lines. EACH line must contain EXACTLY:
    question + TAB + answer
  where TAB is the TAB character (ASCII 9), NOT spaces, NOT markdown, NOT backtick.

CRITICAL rules:
- Do NOT use markdown (no **, backticks, #, -) in the card text
- Do NOT use code fences (no double or triple backtick)
- Do NOT use spaces as a separator — use ONLY tab
- The answer may use <b>termo</b> inline for emphasis
- NO blank lines between cards
- NO list markers (*, -, 1.) at the start of lines

Quality rules:
- Each card tests ONE isolated fact (fine granularity)
- Clear, complete question, with no ambiguous pronouns
- Short answer (1 sentence or 1 term) with the key idea in <b>
- Cover the most important concepts of the lesson, not passing examples
- Do NOT duplicate questions with the same meaning
- FORBIDDEN: shallow/obvious pure-definition questions ("O que e X?"). Focus on APPLICATION,
  mechanics, behavior, WHEN/WHY to use, differences between concepts, or the solution to a
  concrete problem raised in the lesson.
- Vary the types: "quando usar X?", "qual a diferenca entre X e Y?", "o que acontece se...",
  "como resolver...", "por que X em vez de Y?" — active recall, not recognition.

Example of the expected format (the separator between question and answer MUST be a real TAB):
#separator:tab
#html:true
O que e HTTP?${TAB}Protocolo de <b>transmissao</b> de dados na web
Para que serve o DNS?${TAB}<b>Resolucao</b> de nomes em enderecos IP

Lesson title: ${lessonTitle}

Transcript:
---
${trunc(transcript)}
---

Return ONLY the content of the .txt file, with no code fences, no explanation, no chatter.`.trim();
};

export const buildQuizPrompt = ({ lessonTitle, transcript, instruction }) => `
Generate a quiz in Markdown about the lesson below, with 8 to 12 multiple-choice questions
(4 options each, 1 correct). Write the questions, options and explanations in BRAZILIAN
PORTUGUESE.${instructionBlock(instruction)}

EXACT mandatory format per question (the parser depends on this format):

## N. Texto da pergunta?

- [ ] Alternativa A
- [ ] Alternativa B
- [x] Alternativa correta
- [ ] Alternativa D

> Explicacao: por que a alternativa correta esta certa.

Where N is the sequential number (1, 2, 3...) and [x] marks the single correct option.

CRITICAL rules:
- Exactly 1 option with [x] per question (do not use [X], only lowercase [x])
- Always 4 options per question (3 x [ ] and 1 x [x])
- Plausible wrong options (real distractors, not absurd ones)
- Random option order per question
- Do NOT add text outside the format above (no intro, no conclusion)

Cognitive quality (important):
- Do NOT make only definition/memorization questions. AT LEAST HALF must require reasoning:
  application ("dado este cenario, o que acontece?"), analysis ("qual o problema deste codigo?"),
  comparison ("qual a diferenca entre X e Y?") or cause/effect ("por que isso falha?").
- Everything based ONLY on what the lesson taught (scenarios may vary the context, without new resources).

Distractor quality (psychometrics):
- The 4 options must have SIMILAR length and structure — the correct one must NOT be
  systematically the longest/most detailed (that gives away the answer).
- Distractors must reflect real common ERRORS/misconceptions, not absurd options.
- FORBIDDEN: "todas as anteriores", "nenhuma das anteriores" and "todas estao corretas".

Explanation (formative feedback):
- 1-2 sentences: why the correct one is right AND, when helpful, the misconception behind the
  most tempting distractor. Do not invent content outside the lesson.

Lesson title: ${lessonTitle}

Transcript:
---
${trunc(transcript)}
---

Return ONLY the Markdown, with no code fences.`.trim();

export const buildExemplosPrompt = ({ lessonTitle, transcript, instruction }) => `
Generate PRACTICE material in Markdown for the lesson below. It must be 100% ABOUT THIS LESSON:
practice and reproduce what IT taught — nothing about a subject/resource the lesson did not show.
Write the material in BRAZILIAN PORTUGUESE.${instructionBlock(instruction)}

FIRST, decide the lesson type and pick ONE of the two modes:
- MODE A (hands-on): the lesson SHOWED something reproducible. Two cases (pick the one that applies):
  - (A1) CODE/TOOL: code, commands, queries, configuration, tool usage, step-by-step. Practicing =
    REPRODUCING and WRITING code.
  - (A2) MODELING/DIAGRAM: the lesson taught OR demonstrated a diagram NOTATION/technique (BPMN,
    UML including USE CASES, flowchart, DFD, ER, C4) — EVEN if it is a "real example" or seems
    like just an explanation of the notation. Practicing = MODELING scenarios with that notation
    (drawing the diagram), not writing code. A lesson about a kind of diagram is ALWAYS A2, never MODE B.
- MODE B (theoretical/conceptual): the lesson only EXPLAINED concepts, overview, history,
  "what is / why", with nothing concrete to reproduce NOR model. Here do NOT invent practical
  exercises — reinforce the theory with active recall.

Do NOT write ANYTHING before the first \`##\`. Use ONLY the sections of the chosen mode.
Keep the section headers EXACTLY as written below (in Portuguese).

=== MODE A — hands-on lesson (A1 code OR A2 modeling) ===
## Como praticar
Minimal environment/tool to practice and the setup to start. A1: console, editor, playground,
test file. A2: the modeling tool from the lesson (or Draw.io/paper) and how to represent it.
Concrete, without inventing tools that do not exist.

## Passo a passo
Reproduce STEP BY STEP what the lesson demonstrated. In each step, explain WHY it is done (not just
the "how") and show the expected result. A1: \`\`\` blocks with the correct language. A2: it is
MANDATORY to SHOW the diagram (not just describe it in text nor only give tool instructions).
Only what the lesson showed.
${MERMAID_FLOW_RULES}

## Exercicios
3 to 5 progressive exercises (from simplest to most complete) for the student to do ALONE. Each
one with: a clear statement, one short **dica** and the **resultado esperado**. A1 = write code.
A2 = MODEL the scenario; PROVIDE the expected solution as a \`\`\`mermaid block. Keep each
diagram SIMPLE (few nodes) — several small, clear diagrams, one per exercise.

## Desafio
1 challenge that integrates the lesson's main points (code OR model, per A1/A2), with a
statement + expected result. In A2, include ONE \`\`\`mermaid block with the modeled solution.

## Checklist
4 to 6 "Voce consegue...?" items for the student to self-assess before moving on.

=== MODE B — theoretical lesson ===
## Como fixar
How to consolidate this theory (the lesson brought no coding practice): what to re-read, relate
and pay attention to in order to really retain it.

## Explique com suas palavras
3 to 5 questions that ask the student to EXPLAIN or SUMMARIZE the lesson's core concepts (forces
active recall). Only about what the lesson discussed.

## Aplicacao e analise
2 to 4 real scenarios/situations where these concepts appear, for the student to reason about
"when and why" to use them — based only on what the lesson presented. Do not invent steps or tools
the lesson did not provide.

## Checklist de entendimento
4 to 6 "Voce sabe explicar...?" items about the lesson's concepts.

General rules:
- Use **bold** for technical terms; code blocks with the correct language when there is code.
- Concrete and actionable, nothing vague.
- FULL FIDELITY: only what the lesson taught. When unsure between A and B, decide by what the
  lesson actually brought (if there is nothing reproducible, it is MODE B).
- Do NOT cite timestamps nor the instructor's name.

Lesson title: ${lessonTitle}

Transcript:
---
${trunc(transcript)}
---

Return ONLY the Markdown (of ONE mode), with no outer code fences.`.trim();

// Pre-questions (Carpenter & Toftness 2017): questions generated BEFORE the
// video, to force a retrieval attempt. The return MUST be pure JSON so the
// backend can parse it without crazy regex.
export const buildPrequestionsPrompt = ({ lessonTitle, transcript, instruction }) => `
Generate PRE-LESSON questions about the content below. The student will answer BEFORE watching,
to trigger a retrieval attempt (pre-question effect). Getting them wrong is OK — the act of trying
to guess primes the encoding. Write the questions, options and explanations in BRAZILIAN
PORTUGUESE.${instructionBlock(instruction)}

Rules:
- Generate EXACTLY 3 multiple-choice questions (4 options each, 1 correct).
- Focus on the MOST central concepts of the lesson (not passing examples).
- Plausible distractors (not absurd), to require real thinking.
- Clear question, no ambiguous pronouns, self-contained.
- Short explanation (1-2 sentences) of why the correct one is right.

Mandatory format: pure JSON, NO fences, NO text before/after. EXACT schema:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correct_idx": 0,
      "explanation": "string"
    },
    ...
  ]
}

Where correct_idx is 0, 1, 2 or 3 (index into options).

Lesson title: ${lessonTitle}

Transcript:
---
${trunc(transcript)}
---

Return ONLY the JSON.`.trim();

export const buildPiadaPrompt = ({ lessonTitle, transcript, instruction }) => `
Generate 2 short, clever jokes about the content of the lesson below. Write the jokes in BRAZILIAN
PORTUGUESE.${instructionBlock(instruction)}

CRITICAL rules:
- Each joke MUST reference specific concepts from the lesson (function names, algorithms, tools,
  technical terms taught) — nothing generic
- Use pun humor, an absurd analogy or an exaggerated situation related to the topic
- Casual Brazilian Portuguese, as if telling it to a study buddy
- Short: 2 to 5 lines per joke
- No offensive content

EXACT mandatory format (headers in Portuguese):

## Piada 1
(texto da primeira piada)

## Piada 2
(texto da segunda piada)

> Pronto, agora vai arrasar no quiz! 💪

Return ONLY the Markdown, with no code fences.

Lesson title: ${lessonTitle}

Transcript:
---
${trunc(transcript, 8000)}
---`.trim();

// === Podcast (senior dev x junior dev dialogue, synthesized via Chatterbox) ===
// The return MUST be pure JSON: alternating turns with speaker and text. Each
// turn becomes a TTS clip, so the text must be speakable (no markdown, no code,
// no symbols that aren't read aloud).
export const PODCAST_SYSTEM =
  'You write educational PODCAST scripts in BRAZILIAN PORTUGUESE, in the format of a natural ' +
  'conversation between two developers. ALWAYS reply with pure JSON, no text before or after.';

export const buildPodcastScriptPrompt = ({ lessonTitle, transcript, seniorName = 'Luiz', juniorName = 'Daniela' }) => `
Write the script of a PODCAST of roughly 5 MINUTES about the lesson below, in the format of a
conversation between two NAMED characters. Write all spoken text in BRAZILIAN PORTUGUESE.
- "senior" = ${seniorName}: experienced dev, who explains clearly, gives context and everyday examples.
- "junior" = ${juniorName}: the podcast HOST — curious and friendly, leads the conversation and
  asks the questions a student would ask, reacting to what she hears.

The conversation should TEACH the lesson's content in a light way: ${juniorName} asks, ${seniorName}
explains; the questions progress from basic to more advanced, covering the lesson's main points.

Opening (CRITICAL): at the start, both INTRODUCE THEMSELVES BY NAME naturally.
- ${juniorName} opens the episode and introduces herself (e.g. "Oi pessoal, eu sou a ${juniorName} e hoje...").
  She must NOT say she is a "beginner" or "junior" — she is the interviewer/host.
- ${seniorName} introduces himself as the experienced guest (e.g. "E eu sou o ${seniorName}...").

Content rules:
- Base it ONLY on what the transcript teaches. Do NOT invent resources, commands or facts that do
  not appear in the lesson.
- End with a wrap-up (summary of what was discussed / next step), with ${juniorName} closing the episode.
- Real-conversation tone: natural, with reactions ("ah, entendi", "faz sentido"), not robotic.
- Use the names now and then when addressing each other ("Boa pergunta, ${juniorName}").
- Include 1 or 2 light/humorous moments (a fun analogy or a relaxed comment about the topic),
  without forcing it and without turning into a joke — just to keep the conversation human.

Format rules (CRITICAL — each turn becomes voice audio):
- SPEAKABLE text: Portuguese spelled out in full. NO markdown, lists, code, fences, emojis,
  URLs or symbols. Numbers and terms must be written as they are spoken.
- ACRONYMS: write them as they are spoken. If the acronym is read letter by letter, spell it
  phonetically (e.g. "JWT" -> "jota-dablio-te", "SQL" -> "esse-que-ele", "API" -> "a-pe-i"); if it
  is read as a word, keep it (e.g. "REST", "JSON", "JPA"). When unsure, prefer spelling it out.
- Each turn has 1 to 4 sentences. Alternate speakers (never two turns in a row from the same one).
- Between 18 and 30 turns total (to give ~5 minutes of audio).

Mandatory format: pure JSON, NO fences, NO text outside the JSON. EXACT schema:
{
  "title": "titulo curto do episodio",
  "turns": [
    { "speaker": "junior", "text": "..." },
    { "speaker": "senior", "text": "..." }
  ]
}
where "speaker" is exactly "senior" (${seniorName}) or "junior" (${juniorName}).

Lesson title: ${lessonTitle}

Transcript:
---
${trunc(transcript)}
---

Return ONLY the JSON.`.trim();

export const buildDiarioPrompt = ({ lessonTitle, transcript, weekLabel, instruction }) => `
Generate a technical-journal template in Markdown for the lesson below. Use EXACTLY this format
(it is in Portuguese — keep it), filling in ONLY the "O que aprendi" part with 3 to 5 synthesis
bullets; leave the other fields blank (the student fills them later). Write the bullets in
BRAZILIAN PORTUGUESE.${instructionBlock(instruction)}

# Diario Tecnico - ${weekLabel || 'Semana atual'}
> Video: ${lessonTitle}

## O que aprendi nesta aula?
- (bullet 1 sobre conceito-chave)
- (bullet 2)
- ...

## Que decisoes tecnicas tomei?
-

## O que funcionou bem?
-

## O que faria diferente?
-

## Proximos passos
-

## Notas livres


Transcript:
---
${trunc(transcript)}
---

Return ONLY the markdown, with no fences.`.trim();

// === Reading course (generated from a video course's transcripts) ===
// Phase 1: the AI looks at the lesson titles of a module and decides the grouping
// (which become a single reading lesson, which stay isolated).

export const READING_PLAN_SYSTEM =
  'You are an instructional designer. You receive the lessons (transcripts) of a module and ' +
  'reorganize them into a cohesive READING course: combine related short lessons (tend toward ' +
  '~half the total), but each resulting lesson covers ITS SOURCES IN FULL (never shallow). ' +
  'ALWAYS reply with pure JSON, no text before or after. Titles must be in Brazilian Portuguese.';

// lessons: [{ id: number, title: string, bytes?: number }]
// bytes = transcript size (proxy for the lesson's density/duration).
export const buildReadingPlanPrompt = ({ moduleTitle, lessons }) => {
  const hasSize = lessons.some((l) => (l.bytes || 0) > 0);
  // Classify each lesson's relative size as short/medium/long (thirds), so the
  // AI balances the MASS of the groups, not just the lesson count.
  let sizeTag = () => '';
  if (hasSize) {
    const sorted = [...lessons].map((l) => l.bytes || 0).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length / 3)] || 0;
    const q2 = sorted[Math.floor((2 * sorted.length) / 3)] || 0;
    sizeTag = (b) => {
      const n = b || 0;
      if (n <= q1) return ' (short)';
      if (n <= q2) return ' (medium)';
      return ' (LONG)';
    };
  }
  return `
Module: ${moduleTitle}

Below is the list of video lessons in this module (in their original order). Plan a COHESIVE
READING course: combine RELATED short lessons (same topic) into larger reading lessons, without
losing content. Aim for BALANCE — neither 1 giant shallow lesson, nor 1-to-1.

Goal: a module usually becomes HALF OR LESS. A dense module of ~15-18 short, sequential lessons
typically becomes ~5-6 reading lessons. Each reading lesson typically gathers 2 to 5 related
original lessons. Prefer CONSOLIDATING the whole arc of ONE feature into a single reading lesson —
its intro/overview + creation + refactor + challenge that build on each other — instead of
splitting them. Do NOT leave a lone short lesson by itself when it shares the subject with an
adjacent group — fold it in (e.g. a "JPQL queries" lesson belongs with the other query lessons).
${hasSize ? `
DENSITY (important): each lesson is tagged (short), (medium) or (LONG) by transcript size.
Balance the MASS of the groups, not just the count: one (LONG) lesson alone can already become a
reading lesson; several related (short) ones merge into one. Avoid a massive group (several LONGs
together) or a stunted one.
` : ''}
GOLDEN RULE (coverage): the resulting reading lesson must COVER IN FULL everything its source
lessons teach — nothing shallow, nothing cut. If merging too much would make the text
superficial, group LESS (split into more lessons).

Group by topic affinity:
- COMPLEMENTS / CONTINUATIONS are the SAME lesson split apart — ALWAYS merge them and count them
  as ONE (a complement does NOT use up a slot in the ~5 cap). Recognize them by: the SAME title
  repeated; an extra numbering suffix (e.g. "5.4" and "5.4.1", "5.5" and "5.5.1"); "Parte 1/2/N";
  a "Desafio" followed by its "Resolução do desafio"; "continuação". Example:
  [5.5 Desafio ...] + [5.5.1 Desafio ...] -> a SINGLE reading lesson.
- "Parte 1/2/N" and explanation+solution+challenge of the SAME exercise: always together.
- Neighboring lessons on the same subject (e.g. context/intro of the topic + first steps + details).
- A short "overview/why" lesson with the first practical lesson of the same topic.
- Several short lessons that teach DIFFERENT approaches or steps toward the SAME capability belong
  in ONE reading lesson (e.g. all the basic ways to write queries — derived query methods, their
  prefixes, custom @Query, JPQL — form a single "Consultas" lesson). Keep clearly distinct,
  advanced techniques as their own lessons.

Keep them separate when they are clearly distinct topics and dense enough for their own lesson.
Do not force unrelated subjects together just to reduce the count.

Rules:
- Cover ALL lessons. Each id must appear in EXACTLY one group.
- Avoid groups with more than ~5 BASE lessons. Complements/continuations of the same lesson
  (same title, ".1" suffix, "Parte 1..N", "Desafio"+"Resolução") do NOT count toward this limit.
- MASS LIMIT (so nothing gets cut): one reading lesson must cover its sources IN FULL. Do NOT put
  many DENSE lessons together — at most ~2 (LONG) lessons per group; if a thematic group would be
  very heavy (several LONG/medium lessons combined), SPLIT it into 2 cohesive lessons. Coverage and
  fitting the content win over having fewer lessons.
- Preserve the logical learning order.
- Clear, direct titles in Brazilian Portuguese, WITHOUT a number at the start (no "1." or "01").

Lessons:
${lessons.map((l) => `- [${l.id}] ${l.title}${sizeTag(l.bytes)}`).join('\n')}

Reply ONLY with pure JSON in this EXACT schema:
{
  "lessons": [
    { "title": "Titulo da aula de leitura", "sources": [0, 1] }
  ]
}
where "sources" are the ids (the numbers in brackets) of the original lessons that make up
that reading lesson.`.trim();
};

// Phase 2: condense a planned lesson's transcript(s) into a clean, complete reading
// text. That text becomes the reading course's .txt, which later feeds the normal
// pipeline (resumo/exemplos/quiz/flashcards).
export const READING_CONDENSE_SYSTEM =
  'You are a teacher who writes complete, didactic READING LESSONS in BRAZILIAN PORTUGUESE, ' +
  'from (verbose and repetitive) video lesson transcripts. The student will LEARN the subject ' +
  'by reading your text — better and more directly than by watching. Write in Markdown, with ' +
  'context, examples and pitfalls. No greetings, no "leave it in the comments".';

// `instruction` (optional): extra user request (e.g. "modernize to Spring Boot
// 4.x and Java 25"). It has priority over the fidelity rule — it may
// transform/update the content when asked.
export const buildReadingCondensePrompt = ({ lessonTitle, transcript, instruction, sourceLanguage = 'pt' }) => `
Write a complete, didactic READING LESSON, in Markdown, about: "${lessonTitle}". The lesson text
must be in BRAZILIAN PORTUGUESE.${
  sourceLanguage === 'en'
    ? `

ATTENTION — THE TRANSCRIPT BELOW IS IN ENGLISH. Write the ENTIRE lesson in BRAZILIAN PORTUGUESE
(translate the content), but PRESERVE technical terms in English when they are the usual jargon
of the field (e.g. "dependency injection", "endpoint", "thread", "deploy", class names, methods,
annotations and library names). Do not translate code names. The code and identifiers stay as they
are; only the explanatory text goes to Portuguese.`
    : ''
}${
  instruction
    ? `

ADDITIONAL USER INSTRUCTION (TOP PRIORITY — when it conflicts, it outweighs the fidelity rule below):
"""
${instruction}
"""
Apply this when generating the lesson. If the instruction asks to update/modernize the content
(e.g. newer versions of a lib/language, other patterns/syntax), YOU CAN and SHOULD adapt — including
rewriting the code examples to the requested standard — even if the transcript uses an old version.
Keep the lesson's subject matter/concepts; only update the form.`
    : ''
}
The base is the video transcript(s) below (verbose and repetitive). Turn it into a text that
TEACHES in writing — not a dry topic summary, but a well-explained lesson.

Recommended structure (adapt to the content, do not force sections that make no sense):
- A \`#\` title and, right below, 1 short CONTEXT paragraph ("why this matters" / what it is for
  in practice).
- Right after the context, WHEN the topic has visual structure, include ONE OR MORE sections with
  a \`\`\`mermaid diagram. CHOOSE the right type(s) for the content (do not always force a mind map):
  - CLASSES / DOMAIN MODEL (DDD): the lesson shows classes/entities with attributes and relations
    (e.g. JPA entities, DDD aggregates, UML class diagram) -> title "## Diagrama de classes",
    classDiagram format (classes with attributes and relation type).
  - ARCHITECTURE / COMPONENTS / FLOW: layers (Controller/Service/Repository), components,
    microservices, or flow/process/sequence -> title "## Arquitetura" or "## Fluxo", flowchart format.
  - HIERARCHY of concepts/categories/parts of a whole -> title "## Mapa mental", mindmap format.
  If the lesson has BOTH a domain model (classes with attributes) AND a flow/process, include BOTH
  (a classDiagram AND a flowchart) — you decide what fits. NEVER swap a class diagram for a
  flowchart: the classDiagram shows the ATTRIBUTES, the flowchart does not.
  Use a mind map when the content is an overview of concepts. If the subject is purely textual and
  a diagram adds nothing, OMIT it.
- \`##\` sections developing the content in logical learning order, explaining the CONCEPT and the
  WHY, not just the syntax.
- Code examples in \`\`\` blocks with the correct language, commented when it helps.
- If there is a FLOW/PROCESS/sequence or relations to show, use a \`\`\`mermaid block (diagram),
  see the rules below.
- When it makes sense: a "Quando usar / cuidados" section and/or comparison tables.
- Highlight **armadilhas** and **boas praticas** that appear in the transcript.
- End with "## Resumo rapido" — 4 to 7 bullets with what the student should take away.

DIAGRAMS — ABSOLUTE RULE:
- EVERY diagram (mind map, flow, process, hierarchy, relations) MUST use a \`\`\`mermaid block.
  PlantUML, ASCII art or "approximate diagram description" are FORBIDDEN.
- In flowcharts, ALWAYS paste the default classDef block and tag each node with :::type (per-type colors).
- MIND MAP (concept hierarchy) -> use mindmap:
${MERMAID_MINDMAP_RULES}
- FLOW / PROCESS / DFD / ARCHITECTURE / COMPONENTS -> use flowchart:
${MERMAID_FLOW_RULES}
- CLASS DIAGRAM / DOMAIN MODEL (DDD, entities with attributes) -> use classDiagram:
${MERMAID_CLASSES_RULES}
- The labels reflect ONLY what the lesson showed (do not invent concepts).

FIDELITY RULE (the most important):
- Your job is to EXPLAIN BETTER what is in the transcript — NOT to expand the content.
- Do NOT add commands, functions, resources, syntax, parameters or code examples that do NOT
  appear in the transcript. If the lesson did not mention it, it does NOT go in (even if you know
  it exists and is relevant).
- Code blocks must reflect what was shown in the lesson, not "improved" versions.
- The context/intro may situate the subject in general words, but without asserting new technical facts.
- When in doubt whether something was in the lesson: do NOT include it.

Other rules:
- Keep ALL technical content that IS in the transcript (do not cut subject matter). Cut only the
  speech verbosity (repetitions, greetings, padding).
- Use **bold** for technical terms. Do NOT cite timestamps nor the instructor's name.
- Didactic, direct, clear tone, like good course material.

Original transcript(s):
---
${trunc(transcript, 60000)}
---

Return ONLY the lesson in Markdown, with no outer fences and no commentary about the task.`.trim();

// === Update an existing reading lesson (without re-condensing) ===
// Used by "Gerar IA": takes the ALREADY-written reading lesson and only updates
// diagrams (```mermaid with classDef) + applies the user's instruction. It does
// NOT re-condense nor cut content (that is the job of "Gerar curso de leitura").
export const UPDATE_READING_SYSTEM =
  'You update ALREADY-written reading lessons: you preserve the text and explanation in full, ' +
  'only modernize/convert the diagrams to the requested format and apply what the user asks. ' +
  'You NEVER re-condense, summarize or cut content. Reply in Markdown (in Brazilian Portuguese).';

export const buildUpdateReadingPrompt = ({ lessonTitle, transcript, instruction }) => `
Below is a READING LESSON already written in Markdown about "${lessonTitle}". Do NOT rewrite,
do NOT condense and do NOT cut content — PRESERVE all the text and explanation as they are. Keep
it in Brazilian Portuguese.

Your task is ONLY to update:
- Convert ANY existing diagram (old \`\`\`flow JSON block, ASCII art, or a textual description of a
  diagram/flow/map) to the new \`\`\`mermaid standard (with the color classDef) described below,
  PRESERVING THE TYPE of the diagram: CLASS diagram / domain model (classes with attributes) ->
  classDiagram (NEVER turn it into a flowchart and NEVER lose the attributes); flow/process/
  architecture -> flowchart; concept hierarchy -> mindmap.
- If the lesson has BOTH a domain model (classes) AND a flow/process, there may be BOTH diagrams
  (classDiagram AND flowchart) — you decide what fits, but never give up the class diagram when the
  lesson has entities with attributes.
- If the topic has visual structure (hierarchy of concepts/categories) and there is NO "## Mapa
  mental" section, add ONE right after the context paragraph, with a \`\`\`mermaid block.
${instruction && instruction.trim() ? `- Also apply this user instruction: ${instruction.trim()}\n` : ''}Keep the rest IDENTICAL. Return the COMPLETE lesson in Markdown.

For a MIND MAP (concept hierarchy) use:
${MERMAID_MINDMAP_RULES}

For a FLOWCHART/process diagram use:
${MERMAID_FLOW_RULES}

For a CLASS DIAGRAM / domain model (DDD, entities with attributes) use:
${MERMAID_CLASSES_RULES}

Current reading lesson:
---
${trunc(transcript, 60000)}
---
Return ONLY the Markdown of the complete lesson, with no outer fences and no commentary about the task.`.trim();

// === Regenerar UM diagrama (botao "Regenerar" no viewer) ===
// Conserta/melhora um unico bloco Mermaid sem mexer no resto da aula — barato
// (poucos tokens) vs. regenerar a leitura inteira.
export const FIX_DIAGRAM_SYSTEM =
  'You fix broken or low-quality Mermaid diagrams. You return a SINGLE valid ```mermaid block, ' +
  'preserving the diagram TYPE, its nodes/relations and the Brazilian Portuguese labels. ' +
  'No commentary, no extra text.';

export const buildFixDiagramPrompt = ({ lessonTitle, diagram, instruction }) => `
The Mermaid diagram below (from the reading lesson "${lessonTitle}") is BROKEN or low quality and
must be FIXED so it renders. Return ONE corrected \`\`\`mermaid block — SAME meaning, same nodes
and relations (KEEP the Portuguese labels), only fix the syntax/structure to follow the rules.
Do NOT change the diagram TYPE (flowchart stays flowchart, classDiagram stays classDiagram,
mindmap stays mindmap).${
  instruction && instruction.trim() ? `\nAlso apply this user request: ${instruction.trim()}` : ''
}

If it is a FLOWCHART / process / architecture diagram:
${MERMAID_FLOW_RULES}

If it is a CLASS diagram / domain model:
${MERMAID_CLASSES_RULES}

If it is a MIND MAP:
${MERMAID_MINDMAP_RULES}

Broken diagram:
\`\`\`
${diagram}
\`\`\`

Return ONLY the corrected \`\`\`mermaid block, nothing else.`.trim();

// === Job Interview Mode (per module) ===
// Phase 1: generate 5 progressive technical questions from the module content.
// Pure JSON. Phase 2: evaluate the student's answers and give a score + feedback.

export const INTERVIEW_QUESTIONS_SYSTEM =
  'You are a technical recruiter (tech lead) conducting a job interview about the topic of a ' +
  'course module. You generate open questions, like in a real interview. ALWAYS write in ' +
  'BRAZILIAN PORTUGUESE. ALWAYS reply with pure JSON, no text before or after.';

export const buildInterviewQuestionsPrompt = ({ moduleTitle, content }) => `
You will interview a candidate about the topic of the module below. Generate EXACTLY 5 OPEN
technical questions (essay-style, not multiple choice), as a recruiter would.

Rules:
- WRITE EVERYTHING IN BRAZILIAN PORTUGUESE (the questions AND the "topic"). Well-established
  technical terms may stay in the original (e.g. "Bean", "IoC", "Spring Boot"), but the question
  sentence and the topic label must be in Portuguese. NEVER write the whole question in English.
- Progressive: start more basic and go deeper (the 5th must require real mastery).
- Based ONLY on the module content (do not cover things the module did not teach).
- Each question focuses on ONE key concept; clear and direct, no ambiguity.
- Interview tone ("Me explique...", "Qual a diferenca entre...", "Como voce faria...").
- "topic": 2-4 words in Portuguese naming the assessed concept (e.g. "Escopos de Bean", "Injecao de dependencias").

Mandatory format: pure JSON, NO fences, NO text outside the JSON. EXACT schema:
{
  "questions": [
    { "question": "string", "topic": "string" }
  ]
}

Module: ${moduleTitle}

Module content (lesson transcripts):
---
${trunc(content)}
---

Return ONLY the JSON.`.trim();

export const INTERVIEW_EVAL_SYSTEM =
  'You are a technical recruiter evaluating a candidate\'s answers in an interview. ' +
  'Be fair, specific and constructive. ALWAYS write in BRAZILIAN PORTUGUESE. ALWAYS reply ' +
  'with pure JSON, no text before or after.';

// qa: [{ question, topic, answer }]
export const buildInterviewEvalPrompt = ({ moduleTitle, qa }) => `
Evaluate the candidate's answers in the interview about "${moduleTitle}". For EACH question, give
a score from 0 to 10 and short, specific feedback: say what was good and what was missing or could
improve (cite the concept, as in the example: "Sua resposta sobre Bean Scopes foi boa, mas voce
esqueceu de mencionar o escopo de Request"). Write the feedback in BRAZILIAN PORTUGUESE.

Rules:
- Be fair to the level: empty answers or "nao sei" get a low score and feedback saying what was expected.
- Feedback of 1 to 3 sentences per question, direct and useful for the student to study.
- "overall_comment": 2-4 sentences with the overall assessment and what to prioritize when studying.
- The overall score ("overall_score", 0 to 10) reflects the whole (it may be the rounded average).

Questions and answers:
${qa.map((x, i) => `
[${i + 1}] Tema: ${x.topic || '-'}
Pergunta: ${x.question}
Resposta do candidato: ${x.answer && x.answer.trim() ? x.answer : '(em branco)'}`).join('\n')}

Mandatory format: pure JSON, NO fences, NO text outside the JSON. EXACT schema:
{
  "per_question": [
    { "score": 7, "comment": "string" }
  ],
  "overall_score": 7,
  "overall_comment": "string"
}
where per_question has ONE item per question, in the SAME order.

Return ONLY the JSON.`.trim();
