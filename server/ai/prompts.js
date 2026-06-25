// Prompts pro pipeline de geracao. Todos os materiais sao Markdown puro —
// a plataforma cuida do visual. Formatos: resumo .md, quiz .md, exemplos .md,
// flashcards .txt (TSV Anki), diario .md.

const SYSTEM_BASE =
  'Voce eh um assistente educacional que gera material de estudo em portugues do Brasil ' +
  'a partir da transcricao de uma aula em video. Siga o formato solicitado a risca, ' +
  'sem comentarios fora do formato.';

const SYSTEM_PRATICA =
  'Voce eh um instrutor que cria material de PRATICA/FIXACAO em portugues do Brasil, a partir ' +
  'da transcricao de UMA aula, sempre 100% sobre o que ela ensinou. Se a aula for mao na massa ' +
  '(codigo, comandos, ferramenta, passo a passo), foque em FAZER e REPRODUZIR. Se for so teorica, ' +
  'NAO invente pratica: reforce a teoria com recuperacao ativa. Siga o formato a risca.';

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
  text.length > max ? text.slice(0, max) + '\n\n[TRANSCRICAO TRUNCADA]' : text;

// Bloco de instrucao do usuario (nicho/modernizacao) reutilizado por todos os
// materiais. Tem prioridade sobre a fidelidade literal, mas nao muda a materia.
const instructionBlock = (instruction) =>
  instruction && instruction.trim()
    ? `

INSTRUCAO ADICIONAL (PRIORIDADE — aplique ao gerar este material; modernize a FORMA:
versoes, sintaxe, APIs, ferramentas e boas praticas conforme pedido. Vale mais que a
fidelidade literal a transcricao, mas NAO mude a materia/conceitos da aula):
"""
${instruction.trim()}
"""
`
    : '';

// Estilo padrao dos diagramas Mermaid: um bloco classDef que espelha a paleta
// por tipo do FlowDiagram (entity=slate, process=sky, store=violeta,
// decision=ambar, step=esmeralda). A IA cola este bloco no fluxograma e marca
// cada no com :::tipo. O MermaidDiagram ainda normaliza o contraste do texto.
const MERMAID_CLASSDEF =
`  classDef entity fill:#1e293b,stroke:#94a3b8,stroke-width:2px,color:#e8eef6;
  classDef process fill:#0e2a3f,stroke:#38bdf8,stroke-width:2px,color:#e0f2fe;
  classDef store fill:#1f2937,stroke:#a78bfa,stroke-width:2px,color:#ede9fe;
  classDef decision fill:#3a2a0e,stroke:#fbbf24,stroke-width:2px,color:#fef3c7;
  classDef step fill:#0f2a22,stroke:#34d399,stroke-width:2px,color:#d1fae5;`;

// Diagrama PADRAO da plataforma = Mermaid (a IA gera Mermaid com mais facilidade
// e o estilo agora casa com o FlowDiagram via classDef/tema). O formato ```flow
// (React Flow/JSON) continua suportado no render, mas nao e o que a IA emite.
const MERMAID_FLOW_RULES =
`Inclua o diagrama num bloco \`\`\`mermaid com 'flowchart':
\`\`\`mermaid
flowchart TB
  A[Cliente]:::entity --> B(Validar pedido):::process
  B --> C{Estoque ok?}:::decision
  C -->|sim| D[(Banco)]:::store
  C -->|nao| E([Notificar]):::step
${MERMAID_CLASSDEF}
\`\`\`
Serve para FLUXO/PROCESSO/DFD/ARQUITETURA/COMPONENTES (e relacoes simples entre
servicos/componentes).
Regras (siga TODAS, senao quebra ou fica ilegivel):
- COMECE com 'flowchart TB' (vertical) ou 'flowchart LR' (horizontal).
- COLE o bloco classDef acima EXATAMENTE como esta (define as cores por tipo). NAO mude as cores.
- Cada no leva a CLASSE do seu tipo (com ':::') e a FORMA correspondente:
    entity   (ator/entidade/classe/componente): A[Texto]:::entity
    process  (acao/processo/servico):            B(Texto):::process
    store    (dados/tabela/banco):               D[(Texto)]:::store
    decision (decisao):                          C{Texto?}:::decision
    step     (etapa generica):                   E([Texto]):::step
- MACRO: no MAXIMO 8 nos. Labels de no curtos (2-4 palavras).
- Aresta com label: '-->|texto|' com NO MAXIMO 2 palavras; ou sem label ('-->'). Nunca uma frase.
- Defina cada no UMA vez (com forma+classe); depois referencie SO pelo id (A, B, C...).
- NO TEXTO do no, evite os caracteres que quebram o Mermaid: ( ) [ ] { } " ; e ':'.
  Use texto limpo (acentos podem). Na duvida, simplifique o label.`;

const MERMAID_MINDMAP_RULES =
`Inclua o mapa mental num bloco \`\`\`mermaid com 'mindmap' (a INDENTACAO define a hierarquia):
\`\`\`mermaid
mindmap
  root((Tema central))
    Ramo 1
      Detalhe
      Detalhe
    Ramo 2
      Detalhe
\`\`\`
Regras (formato ESTRELA — raso e largo, NUNCA arvore profunda):
- 1 raiz 'root((Tema))'; de 4 a 7 ramos diretos; 1 a 3 folhas por ramo. NO MAXIMO 2 niveis abaixo da raiz.
- Use 2 espacos de indentacao por nivel (raiz / ramo / folha). labels CURTOS (1-4 palavras).
- So a RAIZ usa '((...))'; ramos e folhas sao texto puro, SEM parenteses/colchetes/chaves.`;

// Diagrama de CLASSES UML / modelo de dominio DDD.
const MERMAID_CLASSES_RULES =
`Inclua o diagrama num bloco \`\`\`mermaid com 'classDiagram':
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
Regras:
- Cada 'class Nome { ... }' com 2 a 6 atributos no formato '+Tipo nome'. So o que a aula mostrou (nao invente).
- Relacoes: heranca 'A <|-- B'; composicao 'A *-- B'; agregacao 'A o-- B'; associacao 'A --> B'.
  Multiplicidade entre aspas e label curto apos ' : '. Ex.: 'Pedido "1" *-- "*" Item : contem'.
- NO MAXIMO 8 classes (so o nucleo do dominio). Nomes de classe SEM espacos.`;

export const buildResumoPrompt = ({ lessonTitle, transcript, instruction }) => `
Gere um resumo estruturado em Markdown da aula abaixo.${instructionBlock(instruction)}

Formato obrigatorio (preserve os cabecalhos):

## Pontos Principais
*   (4 a 6 bullets curtos com as ideias-chave)

## Detalhes por topico
### <nome do topico>
*   (3 a 6 bullets com detalhes)

### <outro topico>
*   ...

## Conclusao
(1 paragrafo de 2-4 frases sintetizando o que o aluno deve levar dessa aula)

Use **negrito** pra destacar termos tecnicos. NAO cite timestamps. NAO invente fatos que nao estao na transcricao.

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript)}
---`.trim();

export const buildFlashcardsPrompt = ({ lessonTitle, transcript, instruction }) => {
  // Exemplo com separador TAB real (caractere ASCII 9)
  const TAB = '\t';
  return `
Gere flashcards no formato Anki importavel (tab-separated) a partir da aula abaixo.${instructionBlock(instruction)}

Formato obrigatorio (EXATO, sem desvios):
- Linha 1: #separator:tab
- Linha 2: #html:true
- Em seguida, 10 a 18 linhas. CADA linha deve ter EXATAMENTE:
    pergunta + TAB + resposta
  onde TAB eh o caractere TAB (ASCII 9), NAO espacos, NAO markdown, NAO backtick.

Regras CRITICAS:
- NAO use markdown (sem **, backticks, #, -) no texto dos cards
- NAO use fences de codigo (sem backtick duplo ou triplo)
- NAO use espacos como separador — use SOMENTE tab
- Resposta pode usar <b>termo</b> inline para destaque
- SEM linhas em branco entre cards
- SEM marcadores (*, -, 1.) no inicio das linhas

Regras de qualidade:
- Cada card testa UM fato isolado (granularidade fina)
- Pergunta clara, completa, sem pronomes ambiguos
- Resposta curta (1 frase ou 1 termo) com a ideia-chave em <b>
- Cobrir os conceitos mais importantes da aula, nao exemplos passageiros
- NAO duplicar perguntas com o mesmo sentido
- PROIBIDO perguntas rasas/obvias de definicao pura ("O que e X?"). Foque em APLICACAO,
  mecanica, comportamento, QUANDO/POR QUE usar, diferencas entre conceitos, ou a solucao
  de um problema concreto trazido na aula.
- Varie os tipos: "quando usar X?", "qual a diferenca entre X e Y?", "o que acontece se...",
  "como resolver...", "por que X em vez de Y?" — recuperacao ativa, nao reconhecimento.

Exemplo do formato esperado (separador entre pergunta e resposta DEVE ser TAB real):
#separator:tab
#html:true
O que e HTTP?${TAB}Protocolo de <b>transmissao</b> de dados na web
Para que serve o DNS?${TAB}<b>Resolucao</b> de nomes em enderecos IP

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o conteudo do arquivo .txt, sem fences de codigo, sem explicacao, sem conversas.`.trim();
};

export const buildQuizPrompt = ({ lessonTitle, transcript, instruction }) => `
Gere um quiz em Markdown sobre a aula abaixo, com 8 a 12 questoes de multipla escolha (4 alternativas cada, 1 correta).${instructionBlock(instruction)}

Formato obrigatorio EXATO por questao (o parser depende desse formato):

## N. Texto da pergunta?

- [ ] Alternativa A
- [ ] Alternativa B
- [x] Alternativa correta
- [ ] Alternativa D

> Explicacao: por que a alternativa correta esta certa.

Onde N e o numero sequencial (1, 2, 3...) e [x] marca a unica alternativa correta.

Regras CRITICAS:
- Exatamente 1 alternativa com [x] por questao (nao use [X], apenas [x] minusculo)
- Sempre 4 alternativas por questao (3 x [ ] e 1 x [x])
- Alternativas incorretas plausiveis (distratores reais, nao absurdos)
- Ordem das alternativas aleatoria por questao
- NAO adicione texto fora do formato acima (sem introducao, sem conclusao)

Qualidade cognitiva (importante):
- NAO faca so perguntas de definicao/memorizacao. PELO MENOS METADE deve exigir raciocinio:
  aplicacao ("dado este cenario, o que acontece?"), analise ("qual o problema deste codigo?"),
  comparacao ("qual a diferenca entre X e Y?") ou causa/efeito ("por que isso falha?").
- Tudo baseado SO no que a aula ensinou (cenarios podem variar o contexto, sem recursos novos).

Qualidade dos distratores (psicometria):
- As 4 alternativas devem ter tamanho e estrutura SEMELHANTES — a correta NAO pode ser
  sistematicamente a mais longa/detalhada (entrega a resposta).
- Distratores devem refletir ERROS/equivocos comuns reais, nao opcoes absurdas.
- PROIBIDO "todas as anteriores", "nenhuma das anteriores" e "todas estao corretas".

Explicacao (feedback formativo):
- 1-2 frases: por que a correta esta certa E, quando ajudar, qual o equivoco por tras do
  distrator mais tentador. Sem inventar conteudo fora da aula.

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o Markdown, sem fences de codigo.`.trim();

export const buildExemplosPrompt = ({ lessonTitle, transcript, instruction }) => `
Gere um material de PRATICA em Markdown pra aula abaixo. Ele deve ser 100% SOBRE ESTA AULA:
praticar e reproduzir o que ELA ensinou — nada de assunto/recurso que a aula nao mostrou.${instructionBlock(instruction)}

PRIMEIRO, decida o tipo da aula e escolha UM dos dois modos:
- MODO A (mao na massa): a aula MOSTROU algo reproduzivel. Dois casos (escolha o que se aplica):
  - (A1) CODIGO/FERRAMENTA: codigo, comandos, consultas, configuracao, uso de ferramenta, passo
    a passo. Praticar = REPRODUZIR e ESCREVER codigo.
  - (A2) MODELAGEM/DIAGRAMA: a aula ensinou OU demonstrou uma NOTACAO/tecnica de diagrama (BPMN,
    UML incluindo CASOS DE USO, fluxograma, DFD, ER, C4) — MESMO que seja "exemplo real" ou
    pareca so explicacao da notacao. Praticar = MODELAR cenarios com essa notacao (desenhar o
    diagrama), nao escrever codigo. Aula sobre um tipo de diagrama eh SEMPRE A2, nunca MODO B.
- MODO B (teorica/conceitual): a aula so EXPLICOU conceitos, panorama, historia, "o que e /
  por que", sem nada concreto pra reproduzir NEM modelar. Aqui NAO invente exercicios praticos —
  reforce a teoria com recuperacao ativa.

NAO escreva NADA antes do primeiro \`##\`. Use SOMENTE as secoes do modo escolhido.

=== MODO A — aula mao na massa (A1 codigo OU A2 modelagem) ===
## Como praticar
Ambiente/ferramenta minima pra praticar e o setup pra comecar. A1: console, editor, playground,
arquivo de teste. A2: a ferramenta de modelagem da aula (ou Draw.io/papel) e como representar.
Concreto, sem inventar ferramentas que nao existam.

## Passo a passo
Reproduza PASSO A PASSO o que a aula demonstrou. Em cada etapa, explique o PORQUE dela (nao so o
"como") e mostre o resultado esperado. A1: blocos \`\`\` com a linguagem correta. A2: e
OBRIGATORIO MOSTRAR o diagrama (nao apenas descrever em texto nem so dar instrucoes de
ferramenta). So o que a aula mostrou.
${MERMAID_FLOW_RULES}

## Exercicios
3 a 5 exercicios progressivos (do mais simples ao mais completo) pro aluno fazer SOZINHO. Cada
um com: enunciado claro, uma **dica** curta e o **resultado esperado**. A1 = escrever codigo.
A2 = MODELAR o cenario; FORNECA a solucao esperada como um bloco \`\`\`mermaid. Mantenha cada
diagrama SIMPLES (poucos nos) — varios diagramas pequenos e claros, um por exercicio.

## Desafio
1 desafio que integra os pontos principais da aula (codigo OU modelo, conforme A1/A2), com
enunciado + resultado esperado. Em A2, inclua UM bloco \`\`\`mermaid com a solucao modelada.

## Checklist
4 a 6 itens "Voce consegue...?" pro aluno se autoavaliar antes de seguir.

=== MODO B — aula teorica ===
## Como fixar
Como consolidar essa teoria (a aula nao trouxe pratica de codigo): o que reler, relacionar e
prestar atencao pra fixar de verdade.

## Explique com suas palavras
3 a 5 perguntas que pedem o aluno EXPLICAR ou RESUMIR os conceitos centrais da aula (forca
recuperacao ativa). So sobre o que a aula discutiu.

## Aplicacao e analise
2 a 4 cenarios/situacoes reais onde esses conceitos aparecem, pro aluno raciocinar "quando e por
que" usar — baseado so no que a aula apresentou. Sem inventar passos ou ferramentas que a aula
nao deu.

## Checklist de entendimento
4 a 6 itens "Voce sabe explicar...?" sobre os conceitos da aula.

Regras gerais:
- Use **negrito** pra termos tecnicos; blocos de codigo com a linguagem certa quando houver.
- Concreto e acionavel, nada vago.
- FIDELIDADE TOTAL: so o que a aula ensinou. Na duvida entre A e B, decida pelo que a aula
  realmente trouxe (se nao ha nada reproduzivel, e MODO B).
- NAO cite timestamps nem o nome do instrutor.

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o Markdown (de UM dos modos), sem fences externas de codigo.`.trim();

// Pre-questoes (Carpenter & Toftness 2017): perguntas geradas ANTES do
// video, pra forcar tentativa de recuperacao. O retorno DEVE ser JSON
// puro pra o backend parsear sem regex maluco.
export const buildPrequestionsPrompt = ({ lessonTitle, transcript, instruction }) => `
Gere perguntas de PRE-AULA sobre o conteudo abaixo. O aluno respondera ANTES de assistir,
pra ativar tentativa de recuperacao (efeito de pre-questao). Errar eh OK — o ato de tentar
adivinhar prepara a codificacao.${instructionBlock(instruction)}

Regras:
- Gere EXATAMENTE 3 perguntas de multipla escolha (4 alternativas cada, 1 correta).
- Foque nos conceitos MAIS centrais da aula (nao em exemplos passageiros).
- Distratores plausiveis (nao absurdos), pra exigir pensamento real.
- Pergunta clara, sem pronomes ambiguos, autocontida.
- Explicacao curta (1-2 frases) por que a correta esta certa.

Formato obrigatorio: JSON puro, SEM fences, SEM texto antes/depois. Schema EXATO:
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

Onde correct_idx eh 0,1,2 ou 3 (indice em options).

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o JSON.`.trim();

export const buildPiadaPrompt = ({ lessonTitle, transcript, instruction }) => `
Gere 2 piadas curtas e inteligentes sobre o conteudo da aula abaixo.${instructionBlock(instruction)}

Regras CRITICAS:
- Cada piada DEVE referenciar conceitos especificos da aula (nomes de funcoes, algoritmos, ferramentas, termos tecnicos ensinados) — nada generico
- Use humor de trocadilho, analogia absurda ou situacao exagerada relacionada ao tema
- Portugues casual, como se contasse pra um colega de estudo
- Curtas: 2 a 5 linhas por piada
- Sem conteudo ofensivo

Formato obrigatorio EXATO:

## Piada 1
(texto da primeira piada)

## Piada 2
(texto da segunda piada)

> Pronto, agora vai arrasar no quiz! 💪

Retorne APENAS o Markdown, sem fences de codigo.

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript, 8000)}
---`.trim();

// === Podcast (dialogo dev senior x dev iniciante, sintetizado via Chatterbox) ===
// O retorno DEVE ser JSON puro: turnos alternados com falante e texto. Cada
// turno vira um clip de TTS, entao o texto precisa ser falavel (sem markdown,
// sem codigo, sem simbolos que nao se leem em voz alta).
export const PODCAST_SYSTEM =
  'Voce escreve roteiros de PODCAST educacional em portugues do Brasil, no formato de ' +
  'conversa natural entre dois desenvolvedores. Responda SEMPRE com JSON puro, sem texto ' +
  'antes ou depois.';

export const buildPodcastScriptPrompt = ({ lessonTitle, transcript, seniorName = 'Luiz', juniorName = 'Daniela' }) => `
Escreva o roteiro de um PODCAST de aproximadamente 5 MINUTOS sobre a aula abaixo, no
formato de uma conversa entre dois personagens com NOME:
- "senior" = ${seniorName}: dev experiente, que explica com clareza, dá contexto e exemplos do dia a dia.
- "junior" = ${juniorName}: a ENTREVISTADORA do podcast — curiosa e simpatica, conduz a conversa e
  faz as perguntas que um aluno faria, reagindo ao que ouve.

A conversa deve ENSINAR o conteudo da aula de forma leve: ${juniorName} pergunta, ${seniorName}
explica; as duvidas progridem do basico ao mais avancado, cobrindo os pontos principais da aula.

Abertura (CRITICA): no comeco, os dois se APRESENTAM PELO NOME de forma natural.
- ${juniorName} abre o episodio e se apresenta (ex.: "Oi pessoal, eu sou a ${juniorName} e hoje...").
  Ela NAO deve dizer que e "iniciante" nem "junior" — ela e a entrevistadora/apresentadora.
- ${seniorName} se apresenta como o convidado experiente (ex.: "E eu sou o ${seniorName}...").

Regras de conteudo:
- Baseie-se SO no que a transcricao ensina. NAO invente recursos, comandos ou fatos que nao
  aparecem na aula.
- Termine com um fechamento (resumo do que foi conversado / proximo passo), com ${juniorName}
  encerrando o episodio.
- Tom de conversa real: natural, com reacoes ("ah, entendi", "faz sentido"), sem ser robotico.
- Use os nomes de vez em quando ao se dirigir um ao outro ("Boa pergunta, ${juniorName}").
- Inclua 1 ou 2 momentos leves/bem-humorados (uma analogia divertida ou um comentario
  descontraido sobre o tema), sem forcar e sem virar piada — so pra deixar a conversa humana.

Regras de formato (CRITICAS — cada turno vira audio de voz):
- Texto FALAVEL: portugues por extenso. NADA de markdown, listas, codigo, fences, emojis,
  URLs ou simbolos. Numeros e termos devem estar escritos como se fala.
- SIGLAS: escreva como se falam. Se a sigla e lida letra a letra, soletre foneticamente
  (ex.: "JWT" -> "jota-dablio-te", "SQL" -> "esse-que-ele", "API" -> "a-pe-i"); se e lida
  como palavra, mantenha (ex.: "REST", "JSON", "JPA"). Na duvida, prefira soletrar.
- Cada turno tem 1 a 4 frases. Alterne os falantes (nao dois turnos seguidos do mesmo).
- Entre 18 e 30 turnos no total (pra dar ~5 minutos de audio).

Formato obrigatorio: JSON puro, SEM fences, SEM texto fora do JSON. Schema EXATO:
{
  "title": "titulo curto do episodio",
  "turns": [
    { "speaker": "junior", "text": "..." },
    { "speaker": "senior", "text": "..." }
  ]
}
onde "speaker" e' exatamente "senior" (${seniorName}) ou "junior" (${juniorName}).

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o JSON.`.trim();

export const buildDiarioPrompt = ({ lessonTitle, transcript, weekLabel, instruction }) => `
Gere um template de diario tecnico em Markdown pra aula abaixo. Use EXATAMENTE este formato, preenchendo APENAS a parte do "O que aprendi" com 3 a 5 bullets de sintese; os outros campos deixe em branco (o aluno preenche depois).${instructionBlock(instruction)}

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


Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o markdown, sem fences.`.trim();

// === Curso de leitura (gerado a partir de transcricoes de um curso em video) ===
// Fase 1: a IA olha os titulos das aulas de um modulo e decide o agrupamento
// (quais viram uma aula de leitura unica, quais ficam isoladas).

export const READING_PLAN_SYSTEM =
  'Voce eh um designer instrucional. Recebe as aulas (transcricoes) de um modulo e as reorganiza ' +
  'num curso de LEITURA coeso: combina aulas curtas relacionadas (tende a ~metade do total), mas ' +
  'cada aula resultante cobre INTEGRALMENTE suas fontes (sem ficar rasa). Responda SEMPRE com ' +
  'JSON puro, sem texto antes ou depois.';

// lessons: [{ id: number, title: string, bytes?: number }]
// bytes = tamanho da transcricao (proxy de densidade/duracao da aula).
export const buildReadingPlanPrompt = ({ moduleTitle, lessons }) => {
  const hasSize = lessons.some((l) => (l.bytes || 0) > 0);
  // Classifica o tamanho relativo de cada aula em curto/medio/longo (terços),
  // pra IA equilibrar a MASSA dos grupos, nao so a contagem de aulas.
  let sizeTag = () => '';
  if (hasSize) {
    const sorted = [...lessons].map((l) => l.bytes || 0).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length / 3)] || 0;
    const q2 = sorted[Math.floor((2 * sorted.length) / 3)] || 0;
    sizeTag = (b) => {
      const n = b || 0;
      if (n <= q1) return ' (curta)';
      if (n <= q2) return ' (media)';
      return ' (LONGA)';
    };
  }
  return `
Modulo: ${moduleTitle}

Abaixo a lista de aulas em video deste modulo (na ordem original). Planeje um curso de LEITURA
COESO: combine aulas curtas RELACIONADAS (mesmo tema) em aulas de leitura maiores, sem perder
conteudo. Busque o EQUILIBRIO — nem 1 aula gigante e rasa, nem 1-pra-1.

Meta: um modulo com varias aulas curtas costuma virar ~METADE (ex.: 5 aulas -> 2 ou 3 aulas de
leitura). Cada aula de leitura normalmente reune 2 a 3 aulas originais relacionadas.
${hasSize ? `
DENSIDADE (importante): cada aula vem marcada como (curta), (media) ou (LONGA) pelo tamanho da
transcricao. Equilibre a MASSA dos grupos, nao so a contagem: uma aula (LONGA) sozinha ja pode
virar uma aula de leitura; varias (curtas) relacionadas se juntam numa so. Evite um grupo
massivo (varias LONGAS juntas) ou um grupo raquitico.
` : ''}
REGRA DE OURO (cobertura): a aula de leitura resultante precisa COBRIR INTEGRALMENTE tudo o que
as aulas-fonte ensinam — nada raso, nada cortado. Se juntar muita coisa deixaria o texto
superficial, agrupe MENOS (divida em mais aulas).

Agrupe por afinidade de tema:
- "Parte 1/2/N" e explicacao+resolucao+desafio do MESMO exercicio: sempre juntos.
- Aulas vizinhas do mesmo assunto (ex.: contexto/introducao do tema + primeiros passos + detalhes).
- Uma aula curta de "visao geral/por que" com a primeira aula pratica do mesmo tema.

Mantenha separado quando forem temas claramente distintos e densos o bastante pra aula propria.
Nao force juntar assuntos sem relacao so pra reduzir o numero.

Regras:
- Cobrir TODAS as aulas. Cada id deve aparecer em EXATAMENTE um grupo.
- Evite grupos com mais de ~4 aulas (a nao ser "Parte 1..N" do mesmo tema).
- Preservar a ordem logica de aprendizado.
- Titulos claros e diretos, SEM numero no inicio (nada de "1." ou "01").

Aulas:
${lessons.map((l) => `- [${l.id}] ${l.title}${sizeTag(l.bytes)}`).join('\n')}

Responda APENAS com JSON puro neste schema EXATO:
{
  "lessons": [
    { "title": "Titulo da aula de leitura", "sources": [0, 1] }
  ]
}
onde "sources" sao os ids (os numeros entre colchetes) das aulas originais que compoem
aquela aula de leitura.`.trim();
};

// Fase 2: condensa a(s) transcricao(oes) de uma aula planejada num texto de leitura
// limpo e completo. Esse texto vira o .txt do curso de leitura, que depois alimenta
// o pipeline normal (resumo/exemplos/quiz/flashcards).
export const READING_CONDENSE_SYSTEM =
  'Voce eh um professor que escreve AULAS DE LEITURA completas e didaticas em portugues do ' +
  'Brasil, a partir de transcricoes de aulas em video (verbosas e repetitivas). O aluno vai ' +
  'APRENDER o assunto lendo o seu texto — melhor e mais direto do que assistindo. Escreva em ' +
  'Markdown, com contexto, exemplos e armadilhas. Sem saudacoes, sem "manda nos comentarios".';

// `instruction` (opcional): pedido extra do usuario (ex.: "modernize pra Spring
// Boot 4.x e Java 25"). Tem prioridade sobre a regra de fidelidade — pode
// transformar/atualizar o conteudo quando pedido.
export const buildReadingCondensePrompt = ({ lessonTitle, transcript, instruction, sourceLanguage = 'pt' }) => `
Escreva uma AULA DE LEITURA completa e didatica, em Markdown, sobre: "${lessonTitle}".${
  sourceLanguage === 'en'
    ? `

ATENCAO — A TRANSCRICAO ABAIXO ESTA EM INGLES. Escreva a aula INTEIRA em PORTUGUES DO BRASIL
(traduza o conteudo), mas PRESERVE os termos tecnicos em ingles quando forem o jargao usual
da area (ex.: "dependency injection", "endpoint", "thread", "deploy", nomes de classes,
metodos, anotacoes e bibliotecas). Nao traduza nomes de codigo. O codigo e os identificadores
permanecem como estao; so o texto explicativo vai pra portugues.`
    : ''
}${
  instruction
    ? `

INSTRUCAO ADICIONAL DO USUARIO (PRIORIDADE MAXIMA — quando conflitar, vale mais que a regra
de fidelidade abaixo):
"""
${instruction}
"""
Aplique isso ao gerar a aula. Se a instrucao pedir para atualizar/modernizar o conteudo
(ex.: versoes mais novas de uma lib/linguagem, outros padroes/sintaxe), VOCE PODE e DEVE
adaptar — inclusive reescrever os exemplos de codigo no padrao pedido — mesmo que a
transcricao use uma versao antiga. Mantenha a materia/conceitos da aula; so atualize a forma.`
    : ''
}
A base eh a(s) transcricao(oes) de video abaixo (verbosa e repetitiva). Transforme-a num
texto que ENSINA por escrito — nao um resumo de topicos seco, e sim uma aula bem explicada.

Estrutura recomendada (adapte ao conteudo, nao force secoes que nao fazem sentido):
- Um titulo \`#\` e, logo abaixo, 1 paragrafo curto de CONTEXTO ("por que isso importa" /
  pra que serve na pratica).
- Logo apos o contexto, QUANDO o tema tiver estrutura visual, inclua UMA secao com um diagrama
  \`\`\`mermaid. ESCOLHA o tipo certo conforme o conteudo (nao force sempre mapa mental):
  - CLASSES / MODELO DE DOMINIO (DDD): a aula mostra classes/entidades com atributos e relacoes
    (ex.: entidades JPA, agregados DDD, diagrama de classes UML) -> titulo "## Diagrama de
    classes", formato classDiagram (classes com atributos e tipo de relacao).
  - ARQUITETURA / COMPONENTES / FLUXO: camadas (Controller/Service/Repository), componentes,
    microsservicos, ou fluxo/processo/sequencia -> titulo "## Arquitetura" ou "## Fluxo",
    formato flowchart.
  - HIERARQUIA de conceitos/categorias/partes de um todo -> titulo "## Mapa mental", formato mindmap.
  Prefira o diagrama que mostra a ESTRUTURA TECNICA da aula (classes/arquitetura/fluxo) quando
  ela existir; use mapa mental quando o conteudo for um panorama de conceitos. Se o assunto for
  puramente textual e um diagrama nao agregar, OMITA.
- Secoes \`##\` desenvolvendo o conteudo na ordem logica de aprendizado, explicando o
  CONCEITO e o PORQUE, nao so a sintaxe.
- Exemplos de codigo em blocos \`\`\` com a linguagem correta, comentados quando ajudar.
- Se houver um FLUXO/PROCESSO/sequencia ou relacoes a mostrar, use um bloco \`\`\`mermaid (diagrama),
  veja as regras abaixo.
- Quando fizer sentido: uma secao de "Quando usar / cuidados" e/ou tabelas comparativas.
- Destaque **armadilhas** e **boas praticas** que aparecerem na transcricao.
- Termine com "## Resumo rapido" — 4 a 7 bullets com o que o aluno deve levar.

DIAGRAMAS — REGRA ABSOLUTA:
- TODO diagrama (mapa mental, fluxo, processo, hierarquia, relacoes) DEVE usar um bloco
  \`\`\`mermaid. E PROIBIDO PlantUML, arte ASCII ou "descricao aproximada de diagrama".
- Nos fluxogramas, COLE SEMPRE o bloco classDef padrao e marque cada no com :::tipo (cores por tipo).
- MAPA MENTAL (hierarquia de conceitos) -> use mindmap:
${MERMAID_MINDMAP_RULES}
- FLUXO / PROCESSO / DFD / ARQUITETURA / COMPONENTES -> use flowchart:
${MERMAID_FLOW_RULES}
- DIAGRAMA DE CLASSES / MODELO DE DOMINIO (DDD, entidades com atributos) -> use classDiagram:
${MERMAID_CLASSES_RULES}
- Os rotulos refletem SO o que a aula mostrou (nao invente conceitos).

REGRA DE FIDELIDADE (a mais importante):
- Seu papel eh EXPLICAR MELHOR o que esta na transcricao — NAO ampliar o conteudo.
- NAO acrescente comandos, funcoes, recursos, sintaxes, parametros ou exemplos de codigo
  que NAO aparecem na transcricao. Se a aula nao mencionou, NAO entra (mesmo que voce saiba
  que existe e seja relevante).
- Os blocos de codigo devem refletir o que foi mostrado na aula, nao versoes "melhoradas".
- O contexto/introducao pode situar o assunto em palavras gerais, mas sem afirmar fatos
  tecnicos novos.
- Na duvida sobre se algo estava na aula: NAO inclua.

Outras regras:
- Mantenha TODO o conteudo tecnico que ESTA na transcricao (nada de cortar materia). Corte
  so a verbosidade da fala (repeticoes, saudacoes, enrolacao).
- Use **negrito** para termos tecnicos. NAO cite timestamps nem o nome do instrutor.
- Tom didatico, direto e claro, como um bom material de curso.

Transcricao(oes) original(is):
---
${trunc(transcript, 28000)}
---

Retorne APENAS a aula em Markdown, sem fences externas e sem comentarios sobre a tarefa.`.trim();

// === Atualizar leitura existente (sem recondensar) ===
// Usado pelo "Gerar IA": pega a leitura JA escrita e so atualiza diagramas
// (padrao ```mermaid com classDef) + aplica a instrucao do usuario. NAO recondensa
// nem corta conteudo (isso e papel do "Gerar curso de leitura").
export const UPDATE_READING_SYSTEM =
  'Voce atualiza aulas de leitura JA escritas: preserva integralmente o texto e a explicacao, ' +
  'so moderniza/converte os diagramas para o formato pedido e aplica o que o usuario pedir. ' +
  'NUNCA recondensa, resume ou corta conteudo. Responda em Markdown.';

export const buildUpdateReadingPrompt = ({ lessonTitle, transcript, instruction }) => `
Abaixo esta uma AULA DE LEITURA ja escrita em Markdown sobre "${lessonTitle}". NAO reescreva,
NAO condense e NAO corte conteudo — PRESERVE todo o texto e a explicacao como estao.

Sua tarefa e APENAS atualizar:
- Converta QUALQUER diagrama existente (bloco \`\`\`flow JSON antigo, arte ASCII, ou descricao
  textual de um diagrama/fluxo/mapa) para o novo padrao \`\`\`mermaid (com o classDef de cores)
  descrito abaixo.
- Se o tema tiver estrutura visual (hierarquia de conceitos/categorias) e NAO houver uma secao
  "## Mapa mental", adicione UMA logo apos o paragrafo de contexto, com um bloco \`\`\`mermaid.
${instruction && instruction.trim() ? `- Aplique tambem esta instrucao do usuario: ${instruction.trim()}\n` : ''}Mantenha o restante IDENTICO. Retorne a aula COMPLETA em Markdown.

Para MAPA MENTAL (hierarquia de conceitos) use:
${MERMAID_MINDMAP_RULES}

Para FLUXOGRAMA/DIAGRAMA de processo use:
${MERMAID_FLOW_RULES}

Aula de leitura atual:
---
${trunc(transcript, 28000)}
---
Retorne APENAS o Markdown da aula completa, sem fences externas e sem comentarios sobre a tarefa.`.trim();

// === Modo Entrevista de Emprego (por modulo) ===
// Fase 1: gera 5 perguntas tecnicas progressivas a partir do conteudo do modulo.
// JSON puro. Fase 2: avalia as respostas do aluno e da nota + feedback.

export const INTERVIEW_QUESTIONS_SYSTEM =
  'Voce eh um recrutador tecnico (tech lead) conduzindo uma entrevista de emprego sobre o ' +
  'tema de um modulo de curso. Gera perguntas abertas, como numa entrevista real. Escreva ' +
  'SEMPRE em portugues do Brasil. Responda SEMPRE com JSON puro, sem texto antes ou depois.';

export const buildInterviewQuestionsPrompt = ({ moduleTitle, content }) => `
Voce vai entrevistar um candidato sobre o tema do modulo abaixo. Gere EXATAMENTE 5 perguntas
tecnicas ABERTAS (dissertativas, nao de multipla escolha), como um recrutador faria.

Regras:
- ESCREVA TUDO EM PORTUGUES DO BRASIL (as perguntas E os "topic"). Termos tecnicos consagrados
  podem ficar no original (ex.: "Bean", "IoC", "Spring Boot"), mas a frase da pergunta e o
  rotulo do topic devem estar em portugues. NUNCA escreva a pergunta inteira em ingles.
- Progressivas: comece mais basica e vá aprofundando (a 5ª deve exigir dominio real).
- Baseadas SO no conteudo do modulo (nao cobre coisas que o modulo nao ensinou).
- Cada pergunta foca UM conceito-chave; clara e direta, sem ambiguidade.
- Tom de entrevista ("Me explique...", "Qual a diferenca entre...", "Como voce faria...").
- "topic": 2-4 palavras em portugues nomeando o conceito avaliado (ex.: "Escopos de Bean", "Injecao de dependencias").

Formato obrigatorio: JSON puro, SEM fences, SEM texto fora do JSON. Schema EXATO:
{
  "questions": [
    { "question": "string", "topic": "string" }
  ]
}

Modulo: ${moduleTitle}

Conteudo do modulo (transcricoes das aulas):
---
${trunc(content)}
---

Retorne APENAS o JSON.`.trim();

export const INTERVIEW_EVAL_SYSTEM =
  'Voce eh um recrutador tecnico avaliando as respostas de um candidato numa entrevista. ' +
  'Seja justo, especifico e construtivo. Escreva SEMPRE em portugues do Brasil. Responda ' +
  'SEMPRE com JSON puro, sem texto antes ou depois.';

// qa: [{ question, topic, answer }]
export const buildInterviewEvalPrompt = ({ moduleTitle, qa }) => `
Avalie as respostas do candidato na entrevista sobre "${moduleTitle}". Para CADA pergunta, de
uma nota de 0 a 10 e um feedback curto e especifico: diga o que ficou bom e o que faltou ou
poderia melhorar (cite o conceito, como no exemplo: "Sua resposta sobre Bean Scopes foi boa,
mas voce esqueceu de mencionar o escopo de Request").

Regras:
- Seja justo com o nivel: respostas vazias ou "nao sei" recebem nota baixa e feedback dizendo o
  que era esperado.
- Feedback de 1 a 3 frases por pergunta, direto e util pro aluno estudar.
- "overall_comment": 2-4 frases com a avaliacao geral e o que priorizar nos estudos.
- A nota geral ("overall_score", 0 a 10) reflete o conjunto (pode ser a media arredondada).

Perguntas e respostas:
${qa.map((x, i) => `
[${i + 1}] Tema: ${x.topic || '-'}
Pergunta: ${x.question}
Resposta do candidato: ${x.answer && x.answer.trim() ? x.answer : '(em branco)'}`).join('\n')}

Formato obrigatorio: JSON puro, SEM fences, SEM texto fora do JSON. Schema EXATO:
{
  "per_question": [
    { "score": 7, "comment": "string" }
  ],
  "overall_score": 7,
  "overall_comment": "string"
}
onde per_question tem UM item por pergunta, na MESMA ordem.

Retorne APENAS o JSON.`.trim();
