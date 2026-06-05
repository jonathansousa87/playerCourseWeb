import { getCurrentAccessToken } from '../lib/supabase';

const API_BASE = '';

// Injeta Authorization: Bearer <token> em todos os fetch para /api/* do
export function setupAuthInterceptor() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    // Agora verifica apenas se comeca com /api/ ou /cursos/
    if (typeof url === 'string' && (url.startsWith('/api/') || url.startsWith('/cursos/'))) {
      const token = getCurrentAccessToken();
      if (token) {
        opts = {
          ...opts,
          headers: { Authorization: `Bearer ${token}`, ...opts.headers },
        };
      }
    }
    return originalFetch(url, opts);
  };
}
