// Prompts pro pipeline de geracao. Todos os materiais sao Markdown puro —
// a plataforma cuida do visual. Formatos: resumo .md, quiz .md, exemplos .md,
// flashcards .txt (TSV Anki), diario .md.

const SYSTEM_BASE =
  'Voce eh um assistente educacional que gera material de estudo em portugues do Brasil ' +
  'a partir da transcricao de uma aula em video. Siga o formato solicitado a risca, ' +
  'sem comentarios fora do formato.';

const SYSTEM_PRATICA =
  'Voce eh um instrutor que cria PRATICA aplicada (mao na massa: exercicios e tarefas) em ' +
  'portugues do Brasil, a partir da transcricao de uma aula. Foque em FAZER, nao em resumir ' +
  'a teoria. Adapte ao tema da aula (codigo, consultas, ferramenta ou conceitual). Siga o ' +
  'formato a risca.';

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
Gere um material de PRATICA em Markdown pra aula abaixo. O objetivo eh tirar o aluno da
leitura e colocar pra PRATICAR: o que fazer, como treinar e exercicios pra fixar. NAO eh
um resumo nem repeticao da teoria — eh mao na obra.

Adapte ao tema da aula: pode ser SQL, programacao, uma ferramenta, configuracao ou um
assunto mais conceitual. Se envolver codigo/comandos, traga codigo e diga onde praticar;
se for conceitual, traga tarefas de aplicacao/analise.

Formato obrigatorio EXATO (o app divide por cabecalhos \`##\`; NAO escreva NADA antes do
primeiro \`##\`):

## Como praticar
Onde e como colocar a mao na massa neste assunto: ambiente/ferramenta minima (um console,
editor, playground online, arquivo de teste — o que fizer sentido pro tema) e o setup
minimo pra comecar. Concreto, mas sem inventar ferramentas que nao existam.

## Exemplo guiado
Um exemplo resolvido PASSO A PASSO, baseado no conteudo da aula, mostrando o resultado
esperado. Use blocos \`\`\` com a linguagem correta quando houver codigo.

## Exercicios
3 a 5 exercicios progressivos (do mais simples ao mais completo) pro aluno fazer SOZINHO,
cada um com uma dica curta. Baseados no que a aula ensinou — pode variar o contexto, mas
sem fugir do tema nem usar recursos que a aula nao mostrou.

## Desafio
1 desafio que integra os conceitos principais da aula.

## Checklist
Lista de "Voce consegue...?" (4 a 6 itens) pro aluno se autoavaliar antes de seguir.

Regras:
- Use **negrito** pra termos tecnicos e blocos de codigo com a linguagem certa.
- Exercicios concretos e acionaveis, nao vagos.
- NAO repita a teoria da leitura; foque em FAZER.
- NAO cite timestamps nem o nome do instrutor.

Titulo da aula: ${lessonTitle}

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o Markdown, sem fences externas de codigo.`.trim();

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

export const buildReadingCondensePrompt = ({ lessonTitle, transcript }) => `
Escreva uma AULA DE LEITURA completa e didatica, em Markdown, sobre: "${lessonTitle}".
A base eh a(s) transcricao(oes) de video abaixo (verbosa e repetitiva). Transforme-a num
texto que ENSINA por escrito — nao um resumo de topicos seco, e sim uma aula bem explicada.

Estrutura recomendada (adapte ao conteudo, nao force secoes que nao fazem sentido):
- Um titulo \`#\` e, logo abaixo, 1 paragrafo curto de CONTEXTO ("por que isso importa" /
  pra que serve na pratica).
- Secoes \`##\` desenvolvendo o conteudo na ordem logica de aprendizado, explicando o
  CONCEITO e o PORQUE, nao so a sintaxe.
- Exemplos de codigo em blocos \`\`\` com a linguagem correta, comentados quando ajudar.
- Quando fizer sentido: uma secao de "Quando usar / cuidados" e/ou tabelas comparativas.
- Destaque **armadilhas** e **boas praticas** que aparecerem na transcricao.
- Termine com "## Resumo rapido" — 4 a 7 bullets com o que o aluno deve levar.

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
