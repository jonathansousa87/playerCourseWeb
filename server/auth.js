// Middleware de autenticacao. Valida JWT emitido pelo Supabase Auth via
// JWKS publico (server/auth.supabase.js). Aceita o token em duas formas:
//   - Authorization: Bearer <token>  (padrao API/curl/frontend interceptor)
//   - query param ?t=<token>         (elemento <video> que nao envia headers)
import { verifySupabaseJWT } from './auth.supabase.js';
import { query } from '../db/index.js';

// Busca o perfil (role/status) do usuario; cria na primeira vez que ele
// aparece (signUp do Supabase Auth nao passa pelo backend, entao o primeiro
// request autenticado e quem materializa a linha). O email que faz bootstrap
// (ADMIN_EMAIL) entra direto como admin aprovado; qualquer outro entra pending.
const resolveProfile = async (userId, email) => {
  let { rows } = await query('SELECT role, status FROM user_profiles WHERE user_id = $1', [userId]);
  if (rows.length) return rows[0];

  const isBootstrapAdmin = email?.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();
  const role = isBootstrapAdmin ? 'admin' : 'user';
  const status = isBootstrapAdmin ? 'approved' : 'pending';
  ({ rows } = await query(
    `INSERT INTO user_profiles (user_id, email, role, status) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email
     RETURNING role, status`,
    [userId, email, role, status],
  ));
  return rows[0];
};

export const requireAuth = async (req, res, next) => {
  // /cursos/* sempre exige auth, nos dois modos (filesystem e drive) — antes
  // so exigia em modo drive, e um GET direto em /cursos/<curso>/<arquivo> sem
  // token nenhum servia o arquivo em modo filesystem.
  const isCoursesFile = req.path.startsWith('/cursos/');
  const isApi = req.path.startsWith('/api/');
  if (!isApi && !isCoursesFile) return next();

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
    const { role, status } = await resolveProfile(userId, email);
    if (status !== 'approved') {
      res.set('Cache-Control', 'no-store');
      return res.status(403).json({ error: 'PENDING_APPROVAL', status });
    }
    req.userId = userId;
    req.userEmail = email;
    req.userRole = role;
    req.userStatus = status;
    next();
  } catch {
    res.status(401).json({ error: 'Sessao invalida ou expirada' });
  }
};

export const requireAdmin = (req, res, next) =>
  req.userRole === 'admin'
    ? next()
    : res.status(403).json({ error: 'Acesso restrito ao administrador' });
