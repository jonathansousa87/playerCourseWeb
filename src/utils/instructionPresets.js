// Presets de "Instrucao extra" por nicho, compartilhados entre o "Gerar curso
// de leitura" e o "Gerar IA" por aula. O usuario escolhe um nicho (que preenche
// a instrucao) e pode editar antes de gerar.
//
// O campo `text` vira o bloco ADDITIONAL INSTRUCTION do prompt enviado ao
// DeepSeek — por isso fica em INGLES (o modelo segue instrucoes em ingles com
// mais consistencia). O `label` fica em portugues por ser texto de UI (dropdown).

// Regra comum a todos os presets: modernizar a FORMA sem mudar a materia.
const KEEP = ` Keep the lesson's subject matter and concepts; modernize the FORM (code, APIs, ` +
  `tools) without inventing features that change what the lesson teaches.`;

export const INSTRUCTION_PRESETS = [
  {
    key: 'java',
    label: 'Java + Spring Boot',
    text:
      `Java course with Spring Boot. Modernize ALL code and examples to Java 25 (LTS) and ` +
      `Spring Boot 4 / Spring Framework 7, using the IntelliJ IDEA IDE in environment ` +
      `instructions, even if the original course uses older versions.\n` +
      `JAVA — adopt, when it fits: functional programming (lambdas, method references, Streams ` +
      `with toList()/modern collectors, Optional without get()), records for DTOs/value objects, ` +
      `pattern matching (instanceof and switch) with record patterns and guards (when), switch ` +
      `expressions, sealed classes/interfaces, text blocks, var, java.time, Collection factories ` +
      `(List.of/Map.of), modern String methods (strip/isBlank/lines), HttpClient, sequenced ` +
      `collections, and, in concurrency, virtual threads / structured concurrency when it makes sense.\n` +
      `SPRING — use jakarta.* (not javax.*), constructor injection, RestClient/HTTP Interfaces ` +
      `(@HttpExchange) instead of RestTemplate, error handling with Problem Details ` +
      `(ProblemDetail/RFC 9457), records as DTOs, Bean Validation (jakarta.validation), and the ` +
      `current Spring MVC and Spring Data annotations/APIs.\n` +
      `SPRING SECURITY — adopt the modern lambda-based approach for the SecurityFilterChain ` +
      `(defined as @Bean), fully eliminating the old chained style: use ` +
      `.authorizeHttpRequests(auth -> auth...) instead of the no-lambda methods (no .and() nor ` +
      `authorizeRequests(), removed in Spring Security 7). Keep the architecture fully ` +
      `STATELESS with JWT via SessionCreationPolicy.STATELESS and disable CSRF explicitly via lambda.\n` +
      `OAUTH2 — distinguish the three OAuth2 roles (Authorization Server, Resource Server, Client). ` +
      `For an API that only validates tokens issued elsewhere, configure the app as an OAuth2 ` +
      `Resource Server (spring-boot-starter-oauth2-resource-server): validate JWTs with a ` +
      `JwtDecoder pointed at the issuer's JWKS endpoint ` +
      `(spring.security.oauth2.resourceserver.jwt.issuer-uri) or, for opaque tokens, use an ` +
      `OpaqueTokenIntrospector. When the course needs to issue its own tokens, use Spring ` +
      `Authorization Server — the actively maintained, first-party replacement for the old Spring ` +
      `Security OAuth project — to implement the Authorization Code flow with PKCE (mandatory for ` +
      `public/native clients; Spring Security enables it automatically when no client-secret is ` +
      `set and client-authentication-method is none). Map OAuth2 scopes to Spring authorities ` +
      `(the SCOPE_ prefix) for use in @PreAuthorize/authorizeHttpRequests checks, and, if claims ` +
      `need custom mapping, use a JwtAuthenticationConverter instead of parsing the token by hand.\n` +
      `ACCESS CONTROL — use method security with @EnableMethodSecurity and @PreAuthorize, applying ` +
      `record patterns / pattern matching if there is custom role-extraction logic inside a ` +
      `JwtAuthenticationFilter (extending OncePerRequestFilter). Centralize authentication-failure ` +
      `handling by converting the AuthenticationEntryPoint to Problem Details (ProblemDetail / ` +
      `RFC 9457), guaranteeing clean JSON responses instead of HTML error pages.` + KEEP,
  },
  {
    key: 'python',
    label: 'Python',
    text:
      `Python course. Modernize the examples to Python 3.13+ with current best practices: ` +
      `complete type hints, f-strings, dataclasses or pydantic v2 when it makes sense, ` +
      `pathlib, async/await when applicable, and modern dependency management (uv/poetry).` + KEEP,
  },
  {
    key: 'sql',
    label: 'Banco de dados (MySQL / Oracle / SQL Server)',
    text:
      `Database course (SQL). Use the current versions of the lesson's DBMS (MySQL 8.x, ` +
      `Oracle 23ai, SQL Server 2022/2025) and respect each one's specific syntax.\n` +
      `QUERIES — adopt, when it fits: CTEs (WITH) and recursive CTEs instead of nested ` +
      `subqueries, window functions (ROW_NUMBER, RANK, LAG/LEAD, SUM OVER), explicit JOINs ` +
      `(never a comma in FROM), GROUP BY with filters in HAVING, EXISTS instead of IN with a ` +
      `subquery, and JSON functions when it makes sense.\n` +
      `MODELING — explicit primary and foreign keys, proper normalization, correct types ` +
      `(DECIMAL for money, not FLOAT; TIMESTAMP/DATE for dates), constraints ` +
      `(NOT NULL, UNIQUE, CHECK), and clear, consistent names.\n` +
      `PERFORMANCE AND SECURITY — create indexes on filter/join columns, explain the execution ` +
      `plan (EXPLAIN/EXPLAIN ANALYZE) when relevant, and ALWAYS use parameterized queries/prepared ` +
      `statements (never string concatenation — it prevents SQL injection). Prefer explicit ` +
      `transactions where there are multiple writes.` + KEEP,
  },
  {
    key: 'arquitetura',
    label: 'Arquitetura / Desenho de software',
    text:
      `Software architecture and design course. Update examples, decisions, and diagrams with ` +
      `the current state of the art.\n` +
      `STYLES AND PATTERNS — when it fits: clean/hexagonal architecture (ports & adapters), DDD ` +
      `(bounded contexts, aggregates, domain events), CQRS and event sourcing, microservices vs ` +
      `modular monolith (and when to prefer each), and the main design patterns (GoF) and ` +
      `principles (SOLID).\n` +
      `EVENT-DRIVEN AND MESSAGING — Apache Kafka and RabbitMQ: topics/queues, partitions, consumer ` +
      `groups, ordering, delivery guarantees (at-least-once / exactly-once), idempotency, ` +
      `dead-letter queues (DLQ), and the outbox, saga, and event sourcing patterns. Explain when ` +
      `to use messaging vs synchronous calls.\n` +
      `DIAGRAMS — the C4 model (context, container, component, code) and UML diagrams (sequence, ` +
      `components, deployment, states) when it helps, described in Mermaid.\n` +
      `DECISIONS AND QUALITIES — record trade-offs ADR-style (Architecture Decision Record) and ` +
      `address quality attributes: scalability, resilience (retry, circuit breaker, bulkhead), ` +
      `observability (logs, metrics, distributed tracing), security, and cost.\n` +
      `CLOUD — cite current cloud-native practices (containers, 12-factor, IaC) when the topic ` +
      `calls for it.` + KEEP,
  },
  {
    key: 'modelagem',
    label: 'Modelagem & Diagramas (BPMN, UML, DFD, C4)',
    text:
      `Modeling and diagramming course (requirements analysis/engineering and visual design). ` +
      `Teach the notations rigorously, with correct symbols and real-world examples.\n` +
      `NOTATIONS — when the topic calls for it: BPMN 2.0 (events, activities, gateways, ` +
      `pools/lanes, flows), UML (use case, activity, state machine, class, sequence, component ` +
      `diagrams), Data Flow Diagram (DFD) and context diagram, flowcharts, Entity-Relationship ` +
      `(ER) model, functional decomposition, and decision analysis (decision tables and trees). ` +
      `For architecture, the C4 model (context/container/component).\n` +
      `BEST PRACTICES — for each notation, explain the PURPOSE (what it models and when to use ` +
      `it), the correct elements/symbols, and common mistakes; use concrete, step-by-step examples.\n` +
      `DIAGRAMS IN TEXT — represent them in Mermaid where supported (flowchart for ` +
      `flowchart/BPMN/DFD approximations, sequenceDiagram, classDiagram, stateDiagram) and ` +
      `markdown tables for decision tables. NOTE: BPMN, DFD, and use cases have no native Mermaid ` +
      `notation — use flowchart as a faithful approximation and describe the symbols in the text.` + KEEP,
  },
  {
    key: 'eng',
    label: 'Engenharia de software',
    text:
      `Software engineering course. Update examples and practices with the current state of the ` +
      `art (automated testing, CI/CD, code review, version control, observability) when it fits.` + KEEP,
  },
  {
    key: 'vibe',
    label: 'Vibe coding (dev assistido por IA)',
    text:
      `Vibe coding course (AI-assisted development). Update with current AI-assisted coding ` +
      `practices and tools: effective prompting, critical review of generated code, and iteration.` + KEEP,
  },
  {
    key: 'spec',
    label: 'Spec-driven development',
    text:
      `Spec-driven development course. Update with current practices for writing clear specs ` +
      `before code and deriving the implementation from the specification.` + KEEP,
  },
  {
    key: 'geral',
    label: 'Geral (modernizar)',
    text:
      `Modernize the content and examples to the most current versions and technologies ` +
      `available in ${new Date().getFullYear()} (language, frameworks, libraries, syntax, and ` +
      `best practices), even if the original course uses older versions.` + KEEP,
  },
];
