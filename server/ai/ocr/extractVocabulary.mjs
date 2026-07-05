// Extrai identificadores técnicos (vocabulário canônico) das linhas de texto
// do PaddleOCR. Regex determinístico: CamelCase, /rotas, metodo(), snake_case,
// pacote.qualificado, Arquivo.ext. Dedup + limpeza de ruído (©, ícones, etc.).
//
// O vocabulário canônico é a fonte de verdade que corrige a transcrição do
// WhisperX (garble -> canônico, ancorado na TELA, não no palpite do Qwen).

// Regex de identificadores técnicos. Ordem importa (mais específico primeiro).
const PATTERNS = [
  // Rotas HTTP: /auth, /api/users, /oauth/token
  /\/[a-zA-Z][\w\-/.{}]*[\w)}]/g,
  // CamelCase: TokenService, AuthenticationController, WebSecurityConfig
  /\b[A-Z][a-z]+(?:[A-Z][a-z]*)+\b/g,
  // ALL_CAPS constantes/acrônimos: JWT, HTTP, SQL, API (>=2 chars)
  /\b[A-Z]{2,}\b/g,
  // metodo(): autenticar(), getToken(), parseToken()
  /\b[a-z][\w]*\(\)/g,
  // snake_case: user_name, access_token (>=4 chars p/ evitar ruído curto)
  /\b[a-z]+_[a-z_]+\b/g,
  // pacote.qualified: com.example.service, org.springframework.security
  /\b[a-z]+(?:\.[a-z][\w]*)+\b/g,
  // Arquivo.ext: SecurityConfig.java, pom.xml, application.properties
  /\b[\w]+\.(?:java|xml|properties|yml|yaml|json|sql|kt|py|js|ts|rb|go|rs|cs|cpp|c|h)\b/gi,
];

// Ruído comum do OCR de tela do IntelliJ / IDEs:
// - © (copyright do ícone de anotação)
// - Símbolos soltos de 1 char
// - Números puros
// - Strings com só símbolos
const NOISE_RE = /^([©©®™•·…\-\*\d]+|[\s]+|[^\w]+)$/;

// Min length por token (abaixo disso e ruído ou fragmento).
const MIN_LEN = 2;

// Tokens que parecem técnicos mas são ruído do OCR de UI (menus, breadcrumbs).
const UI_NOISE = new Set([
  'File', 'Edit', 'View', 'Navigate', 'Code', 'Refactor', 'Build', 'Run',
  'Tool', 'Window', 'Help', 'Project', 'Structure', 'Terminal', 'Console',
  'Problems', 'Services', 'Git', 'Commit', 'Branch', 'Log', 'Debug',
  'Get', 'Pro', 'Ultimate', 'Community', 'Edition', 'Settings', 'Preferences',
  'TODO', 'FIXME', 'Warning', 'Error', 'Info', 'Tip', 'New', 'Open', 'Close',
]);

// Dedup case-insensitive (prefere a versão com maiúscula original do OCR).
export const extractVocabulary = (paddleResults) => {
  const bag = new Map(); // lowercase -> { token, count }

  for (const r of paddleResults || []) {
    const lines = r.texts || [];
    for (const line of lines) {
      if (!line || typeof line !== 'string') continue;
      // Limpeza de borda
      const clean = line.trim().replace(/^[©©®™•·…\-*\d.\s]+/, '').trim();
      if (clean.length < MIN_LEN || NOISE_RE.test(clean)) continue;

      for (const pat of PATTERNS) {
        let m;
        pat.lastIndex = 0; // regex global tem estado
        while ((m = pat.exec(line)) !== null) {
          let tok = m[0].trim();
          if (!tok || tok.length < MIN_LEN) continue;
          // Tira pontuação de borda
          tok = tok.replace(/^[^a-zA-Z/]+|[^a-zA-Z0-9/.)}]+$/g, '');
          if (!tok || tok.length < MIN_LEN) continue;
          if (NOISE_RE.test(tok)) continue;
          const lower = tok.toLowerCase();
          if (UI_NOISE.has(tok) || UI_NOISE.has(lower)) continue;
          // ALL_CAPS muito curto (2 chars) pode ser ruído; mantém só se parece acrônimo real
          if (/^[A-Z]{2}$/.test(tok) && !['JWT', 'API', 'SQL', 'HTTP', 'JPA', 'ORM', 'MVC', 'DTO', 'DAO', 'URL', 'URI', 'ID', 'AJAX', 'JSON', 'XML', 'YAML', 'TDD', 'DDD', 'IOC', 'DI', 'AOP', 'OAS', 'JWT'].includes(tok)) {
            // Mantém só acrônimos conhecidos; descarta 2 chars desconhecidos
            continue;
          }
          const existing = bag.get(lower);
          if (existing) {
            existing.count++;
            // Prefere versão com mais maiúsculas (caminho original do OCR)
            const capsExisting = (existing.token.match(/[A-Z]/g) || []).length;
            const capsNew = (tok.match(/[A-Z]/g) || []).length;
            if (capsNew > capsExisting) existing.token = tok;
          } else {
            bag.set(lower, { token: tok, count: 1 });
          }
        }
      }
    }
  }

  // Saída: array de tokens únicos, ordenado por frequência (mais visto = mais
  // confiável), depois alfabético. Filtra muito raro (1 ocorrência e curto).
  const vocab = [...bag.values()]
    .filter((v) => v.count >= 1 && v.token.length >= MIN_LEN)
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token))
    .map((v) => v.token);

  return vocab;
};
