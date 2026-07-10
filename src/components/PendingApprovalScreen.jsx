import { useAuth } from '../contexts/AuthContext';

// Mostrada quando o login funcionou (sessão Supabase válida) mas o backend
// ainda não aprovou a conta (ver GET /api/me e server/auth.js). Único jeito
// de sair daqui sem ser admin é deslogar e esperar a aprovação.
const COPY = {
  pending: {
    icon: '⏳',
    title: 'Aguardando aprovação',
    text: 'Sua conta foi criada com sucesso, mas precisa ser aprovada pelo administrador antes de você acessar a plataforma.',
  },
  rejected: {
    icon: '🚫',
    title: 'Cadastro não aprovado',
    text: 'O administrador não aprovou este cadastro. Se acha que isso é um engano, entre em contato com quem administra a plataforma.',
  },
  suspended: {
    icon: '⛔',
    title: 'Conta suspensa',
    text: 'O acesso desta conta foi suspenso pelo administrador.',
  },
};

const PendingApprovalScreen = () => {
  const { profile, logout } = useAuth();
  const copy = COPY[profile?.status] || COPY.pending;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm text-center">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 border"
          style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-soft-strong)' }}
        >
          <span className="text-2xl">{copy.icon}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--text)' }}>
          {copy.title}
        </h1>
        <p className="text-sm mb-1" style={{ color: 'var(--text-subtle)' }}>
          {profile?.email}
        </p>
        <div
          className="rounded-2xl p-6 border mt-6 text-left"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-strong)' }}
        >
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            {copy.text}
          </p>
          <button
            onClick={logout}
            className="w-full py-2.5 rounded-xl text-sm transition-colors border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalScreen;
