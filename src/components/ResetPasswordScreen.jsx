import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const ResetPasswordScreen = () => {
  const { updatePassword, finishRecovery, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      // Sai da sessão de recovery para forçar login com a nova senha.
      setTimeout(async () => {
        finishRecovery();
        await logout();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 border"
            style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-soft-strong)' }}
          >
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            Redefinir senha
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-subtle)' }}>
            Defina uma nova senha para sua conta
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
          {success ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">✓</div>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Senha redefinida! Redirecionando...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Nova senha (mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-colors"
                  style={{
                    background: 'var(--bg-soft)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-colors"
                  style={{
                    background: 'var(--bg-soft)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              {error && (
                <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordScreen;
