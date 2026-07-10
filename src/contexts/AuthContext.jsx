import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  // undefined = ainda nao buscou (evita telas piscando); null = buscou e
  // falhou de verdade (sessao invalida, erro de rede/backend) — tratado como
  // deslogado, nao fica girando spinner pra sempre. Um 403 PENDING_APPROVAL
  // do backend NAO cai aqui: e o jeito do backend dizer "logado, so sem
  // aprovacao ainda" (ver server/auth.js), vira profile.status='pending'.
  const [profile, setProfile] = useState(undefined);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(undefined);
      return;
    }
    let cancelled = false;
    setProfile(undefined);
    setProfileLoading(true);
    fetch('/api/me')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setProfile({ email: body.email, role: body.role, status: body.status });
        } else if (body.error === 'PENDING_APPROVAL') {
          setProfile({ email: user.email, role: 'user', status: body.status });
        } else {
          setProfile(null);
        }
      })
      .catch(() => { if (!cancelled) setProfile(null); })
      .finally(() => { if (!cancelled) setProfileLoading(false); });
    return () => { cancelled = true; };
    // Depende so do id, nao do objeto `user` inteiro: o Supabase troca a
    // REFERENCIA de `user` a cada refresh de token silencioso (comum quando a
    // aba volta a ficar visivel apos tempo em segundo plano), mesmo sendo o
    // MESMO usuario logado. Se essa dependencia fosse `[user]`, cada refresh
    // resetava `profile` pra undefined -> App.jsx renderizava o Spinner no
    // lugar de MainComponent -> React desmontava o CoursePlatform inteiro
    // (perde `view`/curso/aula selecionados) -> "a plataforma recarrega e
    // volta pro inicio" ao trocar de aba. `user.id` so muda em login/logout
    // de verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  // Retorna { needsConfirmation } — true quando o painel Supabase tem
  // "Confirm email" ligado (signUp não cria sessão imediata).
  const register = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  };

  const requestPasswordReset = async (email) => {
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message);
  };

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  };

  const resendConfirmation = async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw new Error(error.message);
  };

  const finishRecovery = () => setRecoveryMode(false);

  const logout = async () => {
    await supabase.auth.signOut();
    setRecoveryMode(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        recoveryMode,
        profile,
        profileLoading,
        isAdmin: profile?.role === 'admin',
        isApproved: profile?.status === 'approved',
        login,
        register,
        logout,
        requestPasswordReset,
        updatePassword,
        resendConfirmation,
        finishRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
