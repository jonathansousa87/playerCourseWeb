// Validacao de JWT do Supabase Auth via JWKS publico.
// O Supabase migrou para chaves assimetricas (ECC P-256) — nao usamos mais
// shared secret. createRemoteJWKSet faz fetch + cache da chave publica e
// trata rotacao automaticamente.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL nao configurado no .env');
}

const ISSUER = `${SUPABASE_URL}/auth/v1`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

// Retorna { userId, email, payload } ou lanca se token invalido/expirado.
// userId vem do claim `sub` (UUID em auth.users).
export const verifySupabaseJWT = async (token) => {
  const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER });
  return {
    userId: payload.sub,
    email: payload.email,
    payload,
  };
};
