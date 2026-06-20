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

export const buildResumoPrompt = ({ lessonTitle, transcript }) => `
Gere um resumo estruturado em Markdown da aula abaixo.

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

export const buildFlashcardsPrompt = ({ lessonTitle, transcript }) => {
  // Exemplo com separador TAB real (caractere ASCII 9)
  const TAB = '\t';
  return `
Gere flashcards no formato Anki importavel (tab-separated) a partir da aula abaixo.

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

export const buildQuizPrompt = ({ lessonTitle, transcript }) => `
Gere um quiz em Markdown sobre a aula abaixo, com 8 a 12 questoes de multipla escolha (4 alternativas cada, 1 correta).

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
- Explicacao: 1-2 frases diretas, sem inventar conteudo
- NAO adicione texto fora do formato acima (sem introducao, sem conclusao)

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o Markdown, sem fences de codigo.`.trim();

export const buildExemplosPrompt = ({ lessonTitle, transcript }) => `
Gere um material de PRATICA em Markdown pra aula abaixo. Ele deve ser 100% SOBRE ESTA AULA:
praticar e reproduzir o que ELA ensinou — nada de assunto/recurso que a aula nao mostrou.

PRIMEIRO, decida o tipo da aula e escolha UM dos dois modos:
- MODO A (mao na massa): a aula MOSTROU algo reproduzivel — codigo, comandos, consultas,
  configuracao, uso de uma ferramenta, um passo a passo. Aqui da pra praticar de verdade.
- MODO B (teorica/conceitual): a aula so EXPLICOU conceitos, panorama, historia, "o que e /
  por que", sem nada concreto pra reproduzir. Aqui NAO invente exercicios praticos — reforce
  a teoria com recuperacao ativa.

NAO escreva NADA antes do primeiro \`##\`. Use SOMENTE as secoes do modo escolhido.

=== MODO A — aula mao na massa ===
## Como praticar
Ambiente/ferramenta minima pra reproduzir (console, editor, playground, arquivo de teste) e o
setup minimo pra comecar. Concreto, sem inventar ferramentas que nao existam.

## Passo a passo
Reproduza PASSO A PASSO exatamente o que a aula demonstrou, mostrando o resultado esperado em
cada etapa. Use blocos \`\`\` com a linguagem correta quando houver codigo/comando. So o que a
aula mostrou.

## Exercicios
3 a 5 exercicios progressivos (do mais simples ao mais completo) pro aluno fazer SOZINHO, cada
um com uma dica curta. Baseados no que a aula ensinou — pode variar o contexto, sem usar
recursos que a aula nao mostrou.

## Desafio
1 desafio que integra os pontos principais da aula.

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
export const buildPrequestionsPrompt = ({ lessonTitle, transcript }) => `
Gere perguntas de PRE-AULA sobre o conteudo abaixo. O aluno respondera ANTES de assistir,
pra ativar tentativa de recuperacao (efeito de pre-questao). Errar eh OK — o ato de tentar
adivinhar prepara a codificacao.

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

export const buildPiadaPrompt = ({ lessonTitle, transcript }) => `
Gere 2 piadas curtas e inteligentes sobre o conteudo da aula abaixo.

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

Regras de formato (CRITICAS — cada turno vira audio de voz):
- Texto FALAVEL: portugues por extenso. NADA de markdown, listas, codigo, fences, emojis,
  URLs ou simbolos. Numeros e termos devem estar escritos como se fala.
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

export const buildDiarioPrompt = ({ lessonTitle, transcript, weekLabel }) => `
Gere um template de diario tecnico em Markdown pra aula abaixo. Use EXATAMENTE este formato, preenchendo APENAS a parte do "O que aprendi" com 3 a 5 bullets de sintese; os outros campos deixe em branco (o aluno preenche depois).

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
  'Voce eh um designer instrucional. Recebe a lista de aulas (transcricoes) de um modulo ' +
  'e decide como reorganiza-las num curso de LEITURA enxuto. Responda SEMPRE com JSON puro, ' +
  'sem texto antes ou depois.';

// lessons: [{ id: number, title: string }]
export const buildReadingPlanPrompt = ({ moduleTitle, lessons }) => `
Modulo: ${moduleTitle}

Abaixo a lista de aulas em video deste modulo (na ordem original). O curso original eh
"inchado": muitos videos curtos que, em texto, viram UMA aula. Seu trabalho eh planejar um
curso de LEITURA ENXUTO, agrupando AGRESSIVAMENTE as aulas que tratam do mesmo assunto.

Meta: reduzir bastante o numero de aulas. Um modulo com muitas aulas curtas costuma virar
algo como 1/3 a 1/2 do total. Cada aula de leitura resultante deve ter substancia
(normalmente combinando 2 a 5 aulas curtas).

SEMPRE junte no MESMO grupo:
- Aulas marcadas como "Parte 1", "Parte 2", "(Parte N)" do mesmo tema.
- Variacoes incrementais do mesmo topico (ex.: "com 1 parametro" + "com mais de um
  parametro"; "declarando uma variavel" + "declarando mais de uma variavel").
- Uma "explicacao" + a "solucao"/"resolucao" correspondente.
- Sequencias de exercicios ("Explicacao Exercicios", "Resolucao Exercicio 1..N") → uma
  unica aula tipo "Exercicios resolvidos".
- Introducoes curtas, avisos e "cuidado ao..." → no grupo do tema vizinho.
- Varios comandos/funcoes pequenos do mesmo grupo tematico (ex.: funcoes de conversao e
  formatacao de dados juntas).

Regras:
- Cobrir TODAS as aulas. Cada id deve aparecer em EXATAMENTE um grupo.
- Preservar a ordem logica de aprendizado.
- Titulos claros e diretos, SEM numero no inicio (nada de "1." ou "01").
- Deixe ISOLADO so quando o topico eh denso e independente o bastante pra uma aula propria.
- Nao junte assuntos sem relacao so para reduzir o numero — agrupe por afinidade real.

Aulas:
${lessons.map((l) => `- [${l.id}] ${l.title}`).join('\n')}

Responda APENAS com JSON puro neste schema EXATO:
{
  "lessons": [
    { "title": "Titulo da aula de leitura", "sources": [0, 1] }
  ]
}
onde "sources" sao os ids (os numeros entre colchetes) das aulas originais que compoem
aquela aula de leitura.`.trim();

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
- Logo apos o contexto, QUANDO o tema tiver estrutura visual (fluxo/etapas, relacoes
  entre componentes/classes/servicos, hierarquia ou arquitetura), inclua uma secao
  "## Mapa mental" com UM diagrama Mermaid (veja as regras de Mermaid abaixo). Se o
  assunto for puramente textual/teorico e um diagrama nao agregar, OMITA esta secao.
- Secoes \`##\` desenvolvendo o conteudo na ordem logica de aprendizado, explicando o
  CONCEITO e o PORQUE, nao so a sintaxe.
- Exemplos de codigo em blocos \`\`\` com a linguagem correta, comentados quando ajudar.
- Quando fizer sentido: uma secao de "Quando usar / cuidados" e/ou tabelas comparativas.
- Destaque **armadilhas** e **boas praticas** que aparecerem na transcricao.
- Termine com "## Resumo rapido" — 4 a 7 bullets com o que o aluno deve levar.

REGRAS DO DIAGRAMA MERMAID (so quando incluir o "## Mapa mental"):
- Use um bloco fechado \`\`\`mermaid ... \`\`\` com codigo Mermaid VALIDO.
- Escolha o tipo que melhor representa o conteudo: \`flowchart TD\` (fluxo/etapas),
  \`classDiagram\` (classes/relacoes), \`sequenceDiagram\` (interacao/requisicoes),
  \`mindmap\` (hierarquia de conceitos) ou \`erDiagram\` (modelo de dados).
- Rotulos curtos, em portugues, refletindo SO o que a aula mostrou (nao invente).
- Entre 4 e 12 nos — visao geral, nao o conteudo inteiro.
- Para evitar erro de sintaxe: se um rotulo tiver espaco, pontuacao, parenteses ou
  dois-pontos, coloque-o entre aspas duplas (ex.: \`A["Cliente HTTP"] --> B["Controller"]\`).
  Nao use \`(\`, \`)\`, \`:\`, \`;\` soltos dentro de rotulos sem aspas.

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
