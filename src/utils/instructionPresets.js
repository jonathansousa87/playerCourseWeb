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
      `anotacoes/APIs atuais do Spring MVC e Spring Data.\n` +
      `SPRING SECURITY — adote a abordagem moderna baseada em Lambdas para o SecurityFilterChain ` +
      `(definido como @Bean), eliminando completamente encadeamentos antigos: use ` +
      `.authorizeHttpRequests(auth -> auth...) em vez dos metodos sem lambda (nada de .and() nem ` +
      `authorizeRequests(), removidos no Spring Security 7). Configure a arquitetura como totalmente ` +
      `STATELESS com JWT usando SessionCreationPolicy.STATELESS e desabilite o CSRF de forma ` +
      `explicita via lambda. Para controle de acesso, use seguranca baseada em metodos com ` +
      `@EnableMethodSecurity e @PreAuthorize, aplicando record patterns / pattern matching se houver ` +
      `logica customizada de extracao de roles dentro do JwtAuthenticationFilter (estendendo ` +
      `OncePerRequestFilter). Centralize o tratamento de falhas de autenticacao convertendo o ` +
      `AuthenticationEntryPoint para Problem Details (ProblemDetail / RFC 9457), garantindo ` +
      `respostas JSON limpas em vez de paginas HTML de erro.` + KEEP,
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
      `Curso de banco de dados (SQL). Use as versoes atuais do SGBD da aula (MySQL 8.x, ` +
      `Oracle 23ai, SQL Server 2022/2025) e respeite a sintaxe especifica de cada um.\n` +
      `CONSULTAS — adote, quando couber: CTEs (WITH) e CTEs recursivas no lugar de subqueries ` +
      `aninhadas, window functions (ROW_NUMBER, RANK, LAG/LEAD, SUM OVER), JOINs explicitos ` +
      `(nunca virgula no FROM), GROUP BY com filtros em HAVING, EXISTS no lugar de IN com ` +
      `subquery, e funcoes de JSON quando fizer sentido.\n` +
      `MODELAGEM — chaves primarias e estrangeiras explicitas, normalizacao adequada, tipos ` +
      `corretos (DECIMAL pra dinheiro, nao FLOAT; TIMESTAMP/DATE pra datas), constraints ` +
      `(NOT NULL, UNIQUE, CHECK) e nomes claros e consistentes.\n` +
      `DESEMPENHO E SEGURANCA — crie indices nas colunas de filtro/junção, explique o plano de ` +
      `execucao (EXPLAIN/EXPLAIN ANALYZE) quando relevante, e SEMPRE use consultas ` +
      `parametrizadas/prepared statements (nunca concatenacao de strings — evita SQL injection). ` +
      `Prefira transacoes explicitas onde houver multiplas escritas.` + KEEP,
  },
  {
    key: 'arquitetura',
    label: 'Arquitetura / Desenho de software',
    text:
      `Curso de arquitetura e desenho de software. Atualize exemplos, decisoes e diagramas com ` +
      `o estado da arte atual.\n` +
      `ESTILOS E PADROES — quando couber: clean/hexagonal architecture (ports & adapters), DDD ` +
      `(bounded contexts, aggregates, domain events), CQRS e event sourcing, microsservicos vs ` +
      `monolito modular (e quando preferir cada um) e os principais design patterns (GoF) e ` +
      `principios (SOLID).\n` +
      `EVENT-DRIVEN E MENSAGERIA — Apache Kafka e RabbitMQ: topicos/filas, particoes, consumer ` +
      `groups, ordenacao, entrega (at-least-once / exactly-once), idempotencia, dead-letter queue ` +
      `(DLQ) e os padroes outbox, saga e event sourcing. Explique quando usar mensageria vs ` +
      `chamada sincrona.\n` +
      `DIAGRAMAS — modelo C4 (contexto, container, componente, codigo) e diagramas UML (sequencia, ` +
      `componentes, deployment, estados) quando ajudar, descritos em Mermaid.\n` +
      `DECISOES E QUALIDADES — registre trade-offs no estilo ADR (Architecture Decision Record) ` +
      `e enderece atributos de qualidade: escalabilidade, resiliencia (retry, circuit breaker, ` +
      `bulkhead), observabilidade (logs, metricas, tracing distribuido), seguranca e custo.\n` +
      `NUVEM — cite praticas cloud-native atuais (containers, 12-factor, IaC) quando o tema pedir.` + KEEP,
  },
  {
    key: 'modelagem',
    label: 'Modelagem & Diagramas (BPMN, UML, DFD, C4)',
    text:
      `Curso de modelagem e diagramacao (analise/engenharia de requisitos e desenho visual). ` +
      `Ensine as notacoes com rigor, simbolos corretos e exemplos do mundo real.\n` +
      `NOTACOES — quando o tema pedir: BPMN 2.0 (eventos, atividades, gateways, pools/lanes, ` +
      `fluxos), UML (casos de uso, atividade, maquina de estados, classes, sequencia, componentes), ` +
      `Diagrama de Fluxo de Dados (DFD) e diagrama de contexto, fluxogramas, modelo ` +
      `Entidade-Relacionamento (ER), decomposicao funcional, e analise de decisao (tabelas e ` +
      `arvores de decisao). Para arquitetura, modelo C4 (contexto/container/componente).\n` +
      `BOAS PRATICAS — para cada notacao, explique o PROPOSITO (o que modela e quando usar), os ` +
      `elementos/simbolos corretos e os erros comuns; use exemplos concretos e passo a passo.\n` +
      `DIAGRAMAS NO TEXTO — represente em Mermaid quando houver suporte (flowchart para ` +
      `fluxograma/BPMN/DFD aproximados, sequenceDiagram, classDiagram, stateDiagram, erDiagram) e ` +
      `tabelas markdown para tabelas de decisao. OBS.: BPMN, DFD e casos de uso nao tem notacao ` +
      `nativa em Mermaid — use o flowchart como aproximacao fiel e descreva os simbolos no texto.` + KEEP,
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
