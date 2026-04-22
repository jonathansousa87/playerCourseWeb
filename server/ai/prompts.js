// Prompts pro pipeline de geracao. Seguem exatamente o formato dos arquivos
// ja existentes em cada aula (resumo .md, quiz .html, flashcards .txt, diario .md).

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
Gere uma pagina HTML standalone de quiz interativo sobre a aula abaixo, com 8 a 12 questoes de multipla escolha (4 alternativas cada, 1 correta).

Formato obrigatorio (EXATO, respeite tags/classes/atributos pra o parser funcionar):

<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Quiz: ${lessonTitle}</title>
<style>
body{background:#1a1a2e;color:#e0e0e0;font-family:'Segoe UI',sans-serif;padding:20px;line-height:1.6;}
.container{max-width:800px;margin:0 auto;}
h1{color:#00d4ff;text-align:center;}
.question-card{background:#16213e;border-radius:12px;padding:24px;margin:20px 0;}
.question-title{color:#e0e0e0;margin-top:0;}
.answer-btn{display:block;width:100%;text-align:left;padding:14px 20px;margin:8px 0;background:#0d1117;color:#e0e0e0;border:2px solid #333;border-radius:8px;cursor:pointer;font-size:16px;}
.answer-btn:hover{border-color:#00d4ff;}
.answer-btn.correct{background:#0f5132;border-color:#198754;}
.answer-btn.incorrect{background:#58151c;border-color:#dc3545;}
.explanation{margin-top:16px;padding:12px;background:#0d1117;border-left:4px solid #00d4ff;border-radius:4px;display:none;}
.explanation.visible{display:block;}
</style>
</head>
<body>
<div class="container">
<h1>Quiz: ${lessonTitle}</h1>
<div class="question-card">
<h3 class="question-title">Texto da pergunta 1</h3>
<button class="answer-btn" data-correct="false">Alternativa A</button>
<button class="answer-btn" data-correct="true">Alternativa B (correta)</button>
<button class="answer-btn" data-correct="false">Alternativa C</button>
<button class="answer-btn" data-correct="false">Alternativa D</button>
<div class="explanation">Explicacao: por que a resposta correta eh a B.</div>
</div>
<!-- ... mais 7 a 11 question-card seguindo o mesmo padrao ... -->
</div>
<script>
document.querySelectorAll('.question-card').forEach(card => {
  const btns = card.querySelectorAll('.answer-btn');
  const exp = card.querySelector('.explanation');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      btns.forEach(b => { b.disabled = true; if (b.dataset.correct === 'true') b.classList.add('correct'); });
      if (btn.dataset.correct !== 'true') btn.classList.add('incorrect');
      if (exp) exp.classList.add('visible');
    });
  });
});
</script>
</body>
</html>

Regras:
- Exatamente UMA alternativa com data-correct="true" por question-card
- Cada .explanation explica por que a correta eh correta (nao invente, use o conteudo da aula)
- Alternativas incorretas devem ser plausiveis (distratores), nao absurdas
- Ordem das alternativas aleatoria (nao colocar sempre a correta na mesma posicao)

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o HTML completo, sem fences de codigo.`.trim();

export const buildExemplosPrompt = ({ lessonTitle, transcript }) => `
Gere uma pagina HTML standalone com exemplos praticos dos conceitos da aula abaixo.

Formato obrigatorio (EXATO, respeite tags/classes pra combinar com o visual dos outros arquivos de exemplos):

<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Exemplos: ${lessonTitle}</title>
<style>
body{background:#1a1a2e;color:#e0e0e0;font-family:'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;}
h1{color:#00d4ff;border-bottom:2px solid #00d4ff;padding-bottom:10px;}
h2{color:#00d4ff;}
h3{color:#bb86fc;}
.card{background:#16213e;border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 4px 6px rgba(0,0,0,.3);}
pre,code{background:#0d1117;color:#58a6ff;border-radius:8px;font-family:Consolas,Monaco,monospace;}
pre{padding:16px;overflow-x:auto;}
code{padding:2px 6px;}
ul{padding-left:20px;}
li{margin-bottom:8px;}
</style>
</head>
<body>
<h1>Exemplos: ${lessonTitle}</h1>

<div class="card">
<h2>1. Nome do conceito</h2>
<p><strong>Explicacao:</strong> o que eh o conceito.</p>
<p><strong>Exemplo de Uso:</strong> situacao pratica ou codigo. Use <pre><code>...</code></pre> quando for codigo.</p>
</div>

<!-- Mais 3 a 6 cards como esse, um por conceito da aula -->

<div class="card">
<h2>Pontos-chave</h2>
<ul>
<li>Takeaway 1 em negrito quando tecnico.</li>
<li>Takeaway 2.</li>
<li>Takeaway 3.</li>
</ul>
</div>
</body>
</html>

Regras:
- Gere entre 4 e 7 cards com conceitos da aula (alem do ultimo card "Pontos-chave")
- Cada card pode ter subsecoes: "Explicacao", "Exemplo de Uso", "Instalacao", "Exemplo 1 - X", "Exemplo de Referencia" etc. (varie conforme o conteudo)
- Se a aula tem codigo, inclua blocos <pre><code>...</code></pre>
- Exemplos devem ser baseados no que a aula de fato mostra, nao inventados
- Ultimo card sempre "Pontos-chave" com <ul> de bullets

Transcricao:
---
${trunc(transcript)}
---

Retorne APENAS o HTML completo, sem fences de codigo.`.trim();

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
