import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY sao obrigatorios');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Precisa ser true para os fluxos de link por e-mail (recuperacao de senha
    // e confirmacao): o token chega no hash da URL (#access_token&type=recovery)
    // e so dispara PASSWORD_RECOVERY se o cliente fizer o parse. O OAuth do
    // Drive volta para o backend (/api/drive/callback), entao nao ha conflito.
    detectSessionInUrl: true,
  },
});

// Cache sincrono do access_token, atualizado por listener. Util pra contextos
// onde nao da pra await (ex: src=URL no <video> que e construida sincrona em
// render). getSession() e' async — esse cache responde imediato.
let _accessToken = null;
export const getCurrentAccessToken = () => _accessToken;

supabase.auth.getSession().then(({ data }) => {
  _accessToken = data.session?.access_token ?? null;
});

supabase.auth.onAuthStateChange((_event, session) => {
  _accessToken = session?.access_token ?? null;
});
