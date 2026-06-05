import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainComponent from './components/CoursePlatform';
import LoginScreen from './components/LoginScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';

const AppInner = () => {
  const { user, loading, recoveryMode } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-7 h-7 border-2 rounded-full animate-spin"
             style={{ borderColor: 'var(--accent-soft-strong)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  if (recoveryMode) return <ResetPasswordScreen />;
  return user ? <MainComponent /> : <LoginScreen />;
};

const App = () => (
  <AuthProvider>
    <AppInner />
  </AuthProvider>
);

export default App;
