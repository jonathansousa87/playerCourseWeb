// Presets de "Instrucao extra" por nicho, compartilhados entre o "Gerar curso
// de leitura" e o "Gerar IA" por aula. O usuario escolhe um nicho (que preenche
// a instrucao) e pode editar antes de gerar.

// Regra comum a todos os presets: modernizar a FORMA sem mudar a materia.
const KEEP = ` Mantenha a materia e os conceitos da aula; modernize a FORMA (codigo, APIs, ` +
  `ferramentas) sem inventar recursos que mudem o que a aula ensina.`;

export const INSTRUCTION_PRESETS = [
  {
    key: 'java',
    label: 'Java + Spring Boot',
    text:
      `Curso de Java com Spring Boot. Modernize TODO o codigo e os exemplos para Java 25 (LTS) e ` +
      `Spring Boot 4 / Spring Framework 7, usando a IDE IntelliJ IDEA nas instrucoes de ambiente, ` +
      `mesmo que o curso original use versoes antigas.\n` +
      `JAVA — adote, quando couber: programacao funcional (lambdas, method references, Streams ` +
      `com toList()/collectors modernos, Optional sem get()), records para DTOs/value objects, ` +
      `pattern matching (instanceof e switch) com record patterns e guardas (when), switch ` +
      `expressions, sealed classes/interfaces, text blocks, var, java.time, Collection factories ` +
      `(List.of/Map.of), metodos modernos de String (strip/isBlank/lines), HttpClient, sequenced ` +
      `collections e, em concorrencia, virtual threads / structured concurrency quando fizer sentido.\n` +
      `SPRING — use jakarta.* (nao javax.*), injecao por construtor, RestClient/HTTP Interfaces ` +
      `(@HttpExchange) no lugar de RestTemplate, tratamento de erros com Problem Details ` +
      `(ProblemDetail/RFC 9457), records como DTOs, Bean Validation (jakarta.validation) e as ` +
      `anotacoes/APIs atuais do Spring MVC e Spring Data.` + KEEP,
  },
  {
    key: 'python',
    label: 'Python',
    text:
      `Curso de Python. Modernize os exemplos para Python 3.13+ com boas praticas atuais: ` +
      `type hints completos, f-strings, dataclasses ou pydantic v2 quando fizer sentido, ` +
      `pathlib, async/await quando aplicavel e gerenciamento de dependencias moderno (uv/poetry).` + KEEP,
  },
  {
    key: 'sql',
    label: 'Banco de dados (MySQL / Oracle / SQL Server)',
    text:
      `Curso de banco de dados (SQL). Modernize os exemplos com SQL atual e boas praticas: ` +
      `CTEs (WITH), window functions, JOINs explicitos, nomes claros e indices quando relevante. ` +
      `Respeite a sintaxe do SGBD da aula (MySQL, Oracle ou SQL Server).` + KEEP,
  },
  {
    key: 'arquitetura',
    label: 'Arquitetura / Desenho de software',
    text:
      `Curso de arquitetura e desenho de software. Atualize exemplos e referencias com padroes ` +
      `e praticas atuais (clean architecture, DDD, microsservicos, event-driven, observabilidade) ` +
      `quando couber, com diagramas claros.` + KEEP,
  },
  {
    key: 'eng',
    label: 'Engenharia de software',
    text:
      `Curso de engenharia de software. Atualize exemplos e praticas com o estado da arte atual ` +
      `(testes automatizados, CI/CD, code review, versionamento, observabilidade) quando couber.` + KEEP,
  },
  {
    key: 'vibe',
    label: 'Vibe coding (dev assistido por IA)',
    text:
      `Curso de vibe coding (desenvolvimento assistido por IA). Atualize com praticas e ferramentas ` +
      `atuais de codar com IA: prompts eficazes, revisao critica do codigo gerado e iteracao.` + KEEP,
  },
  {
    key: 'spec',
    label: 'Spec-driven development',
    text:
      `Curso de desenvolvimento orientado a especificacao (spec-driven). Atualize com praticas ` +
      `atuais de escrever specs claras antes do codigo e derivar a implementacao da especificacao.` + KEEP,
  },
  {
    key: 'geral',
    label: 'Geral (modernizar)',
    text:
      `Modernize o conteudo e os exemplos para as versoes e tecnologias mais atuais disponiveis em ` +
      `${new Date().getFullYear()} (linguagem, frameworks, bibliotecas, sintaxe e boas praticas), ` +
      `mesmo que o curso original use versoes antigas.` + KEEP,
  },
];
