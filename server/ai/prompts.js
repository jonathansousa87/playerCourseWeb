// Prompts pro pipeline de geracao. Todos os materiais sao Markdown puro —
// a plataforma cuida do visual. Formatos: resumo .md, quiz .md, exemplos .md,
// flashcards .txt (TSV Anki), diario .md.

const SYSTEM_BASE =
  'Voce eh um assistente educacional que gera material de estudo em portugues do Brasil ' +
  'a partir da transcricao de uma aula em video. Siga o formato solicitado a risca, ' +
  'sem comentarios fora do formato.';

export const SYSTEM_PROMPTS = {
  resumo: SYSTEM_BASE,
  quiz: SYSTEM_BASE,
  flashcards: SYSTEM_BASE,
  diario: SYSTEM_BASE,
  exemplos: SYSTEM_BASE,
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
Gere exemplos praticos em Markdown dos conceitos da aula abaixo.

Formato obrigatorio EXATO (o parser divide por cabecalhos ##):

## 1. Nome do Conceito

**Explicacao:** o que eh o conceito.

**Exemplo de Uso:** situacao pratica ou codigo.

\`\`\`linguagem
codigo aqui quando aplicavel
\`\`\`

## 2. Outro Conceito

...

## Pontos-chave

- Takeaway 1 em **negrito** quando tecnico.
- Takeaway 2.
- Takeaway 3.

Regras:
- Entre 4 e 7 secoes de conceitos (## N. Nome) antes da secao "## Pontos-chave"
- Ultima secao SEMPRE "## Pontos-chave" com lista de bullets
- Use blocos de codigo com linguagem especificada (python, js, bash etc.) quando a aula tiver codigo
- Exemplos baseados no que a aula mostra, nao inventados
- Subsecoes variaveis conforme o conteudo: Explicacao, Exemplo de Uso, Instalacao, Referencia etc.
- Use **negrito** pra termos tecnicos

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
