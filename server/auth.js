// Middleware de autenticacao. Valida JWT emitido pelo Supabase Auth via
// JWKS publico (server/auth.supabase.js). Aceita o token em duas formas:
//   - Authorization: Bearer <token>  (padrao API/curl/frontend interceptor)
//   - query param ?t=<token>         (elemento <video> que nao envia headers)
import { verifySupabaseJWT } from './auth.supabase.js';
import { getCourseSource } from './config.js';

export const requireAuth = async (req, res, next) => {
  const source = getCourseSource();
  const isDriveFile = req.path.startsWith('/cursos/') && source === 'drive';
  const isApi = req.path.startsWith('/api/');
  if (!isApi && !isDriveFile) return next();

  let rawToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : req.query?.t;

  // Se houver multiplos 't' params, pega o primeiro
  if (Array.isArray(rawToken)) {
    rawToken = rawToken[0];
  }

  if (!rawToken) {
    return res.status(401).json({ error: 'Nao autenticado' });
  }

  try {
    const { userId, email } = await verifySupabaseJWT(rawToken);
    req.userId = userId;
    req.userEmail = email;
    next();
  } catch {
    res.status(401).json({ error: 'Sessao invalida ou expirada' });
  }
};
