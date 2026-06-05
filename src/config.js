// Configuração centralizada do cliente.
//
// API_BASE vazio ("") faz os fetches usarem caminhos relativos, que em dev
// passam pelo proxy do Vite (/api e /cursos -> backend) e em produção batem
// na mesma origem. Defina VITE_API_BASE apenas se o backend estiver em outro
// host/porta.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Caminho padrão dos cursos no servidor. O valor real é carregado do backend
// via /api/config/courses-path; este serve apenas de fallback inicial e pode
// ser definido por ambiente com VITE_COURSES_PATH.
export const DEFAULT_COURSES_PATH = import.meta.env.VITE_COURSES_PATH ?? "";
