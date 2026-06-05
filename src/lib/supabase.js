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
    detectSessionInUrl: false,
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
