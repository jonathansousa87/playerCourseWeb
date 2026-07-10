import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainComponent from './components/CoursePlatform';
import LoginScreen from './components/LoginScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import PendingApprovalScreen from './components/PendingApprovalScreen';

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
    <div className="w-7 h-7 border-2 rounded-full animate-spin"
         style={{ borderColor: 'var(--accent-soft-strong)', borderTopColor: 'var(--accent)' }} />
  </div>
);

const AppInner = () => {
  const { user, loading, recoveryMode, profile, profileLoading, isApproved } = useAuth();

  if (loading) return <Spinner />;
  if (recoveryMode) return <ResetPasswordScreen />;
  if (!user) return <LoginScreen />;
  // Logado, mas ainda nao sabemos o status (profile === undefined) — evita
  // "piscar" a tela de aprovacao pendente pra quem ja esta aprovado enquanto
  // o /api/me carrega. profile === null e falha de verdade (sessao invalida,
  // rede) — trata como deslogado em vez de girar spinner pra sempre.
  if (profileLoading || profile === undefined) return <Spinner />;
  if (profile === null) return <LoginScreen />;
  if (!isApproved) return <PendingApprovalScreen />;
  return <MainComponent />;
};

const App = () => (
  <AuthProvider>
    <AppInner />
  </AuthProvider>
);

export default App;
