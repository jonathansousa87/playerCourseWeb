import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Modos: login | register | verify | forgot | forgot-sent
const LoginScreen = () => {
  const { login, register, requestPasswordReset, resendConfirmation } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'register') {
        if (fullName.trim().length < 2) throw new Error('Informe seu nome completo.');
        const { needsConfirmation } = await register(email, password, fullName.trim());
        if (needsConfirmation) {
          setMode('verify');
        }
        // Caso contrário, signUp já cria sessão e o AuthProvider redireciona pra Main.
      } else if (mode === 'forgot') {
        await requestPasswordReset(email);
        setMode('forgot-sent');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await resendConfirmation(email);
      setInfo('Email reenviado. Verifique sua caixa de entrada (e spam).');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ----- estados sem form -----
  if (mode === 'verify') {
    return (
      <Shell title="Verifique seu email" subtitle="Quase lá!" icon="📬">
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Enviamos um link de confirmação para <b style={{ color: 'var(--text)' }}>{email}</b>. Clique nele para ativar sua conta.
        </p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-subtle)' }}>
          Não recebeu? Verifique a pasta de spam ou reenvie.
        </p>
        {info && <Alert kind="info">{info}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <button
          onClick={handleResend}
          disabled={loading}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 mb-2"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {loading ? 'Reenviando...' : 'Reenviar email'}
        </button>
        <button
          onClick={() => switchMode('login')}
          className="w-full py-2.5 rounded-xl text-sm transition-colors border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Voltar para login
        </button>
      </Shell>
    );
  }

  if (mode === 'forgot-sent') {
    return (
      <Shell title="Email enviado" subtitle="Confira sua caixa" icon="✉️">
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Se existe uma conta para <b style={{ color: 'var(--text)' }}>{email}</b>, você receberá um link para redefinir a senha em alguns instantes.
        </p>
        <button
          onClick={() => switchMode('login')}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Voltar para login
        </button>
      </Shell>
    );
  }

  // ----- formulários (login | register | forgot) -----
  const titles = {
    login: { t: 'Player Course', s: 'Entre na sua conta' },
    register: { t: 'Criar conta', s: 'Comece sua jornada de estudos' },
    forgot: { t: 'Esqueci minha senha', s: 'Vamos enviar um link de redefinição' },
  };
  const cur = titles[mode];

  return (
    <Shell title={cur.t} subtitle={cur.s} icon="▶">
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <Field label="Nome completo">
            <input
              type="text"
              required
              autoFocus
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-colors"
              style={inputStyle}
            />
          </Field>
        )}

        <Field label="Email">
          <input
            type="email"
            required
            autoFocus={mode !== 'register'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-colors"
            style={inputStyle}
          />
        </Field>

        {mode !== 'forgot' && (
          <Field label={`Senha${mode === 'register' ? ' (mínimo 8 caracteres)' : ''}`}>
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-colors"
              style={inputStyle}
            />
          </Field>
        )}

        {error && <Alert kind="error">{error}</Alert>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {loading
            ? 'Aguarde...'
            : mode === 'login'
              ? 'Entrar'
              : mode === 'register'
                ? 'Criar conta'
                : 'Enviar link'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t text-center space-y-2"
        style={{ borderColor: 'var(--border)' }}
      >
        {mode === 'login' && (
          <>
            <button
              onClick={() => switchMode('forgot')}
              className="block w-full text-sm transition-colors"
              style={{ color: 'var(--text-subtle)' }}
            >
              Esqueci minha senha
            </button>
            <button
              onClick={() => switchMode('register')}
              className="block w-full text-sm transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              Não tem conta? <b style={{ color: 'var(--accent)' }}>Cadastre-se</b>
            </button>
          </>
        )}
        {mode === 'register' && (
          <button
            onClick={() => switchMode('login')}
            className="block w-full text-sm transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            Já tem conta? <b style={{ color: 'var(--accent)' }}>Entrar</b>
          </button>
        )}
        {mode === 'forgot' && (
          <button
            onClick={() => switchMode('login')}
            className="block w-full text-sm transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            Voltar para login
          </button>
        )}
      </div>
    </Shell>
  );
};

const inputStyle = {
  background: 'var(--bg-soft)',
  borderColor: 'var(--border)',
  color: 'var(--text)',
};

const Shell = ({ title, subtitle, icon, children }) => (
  <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 border"
          style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-soft-strong)' }}
        >
          <span className="text-2xl">{icon}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          {title}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-subtle)' }}>
          {subtitle}
        </p>
      </div>
      <div
        className="rounded-2xl p-6 border"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-strong)',
        }}
      >
        {children}
      </div>
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
      {label}
    </label>
    {children}
  </div>
);

const Alert = ({ kind, children }) => {
  const palette =
    kind === 'error'
      ? 'bg-red-500/10 border-red-500/30 text-red-300'
      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
  return (
    <div className={`px-3.5 py-2.5 border rounded-xl text-sm ${palette}`}>
      {children}
    </div>
  );
};

export default LoginScreen;
