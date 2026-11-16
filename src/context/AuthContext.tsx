import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { X, Lock, Mail, User, Briefcase, Terminal } from 'lucide-react';
import { apiFetch, getAuthToken, setAuthToken, type UserProfile } from '../lib/api';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: {
    username: string;
    email: string;
    full_name: string;
    password: string;
    target_role?: string;
  }) => Promise<void>;
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

interface LoginFormValues {
  identifier: string;
  password: string;
}

interface RegisterFormValues {
  username: string;
  email: string;
  full_name: string;
  password: string;
  target_role: string;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const refreshUser = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setAuthToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await apiFetch<{ token?: string; access_token?: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      setAuthToken(res.access_token ?? res.token ?? null);
      setUser(res.user);
      setModalOpen(false);
      setAuthError('');
      await queryClient.invalidateQueries();
    },
    [queryClient]
  );

  const register = useCallback(
    async (payload: {
      username: string;
      email: string;
      full_name: string;
      password: string;
      target_role?: string;
    }) => {
      const res = await apiFetch<{ token?: string; access_token?: string; user: UserProfile }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuthToken(res.access_token ?? res.token ?? null);
      setUser(res.user);
      setModalOpen(false);
      setAuthError('');
      await queryClient.invalidateQueries();
    },
    [queryClient]
  );

  const demoLogin = useCallback(async () => {
    await login('alex@pythonmastery.dev', 'PythonMastery!2026');
  }, [login]);

  const logout = useCallback(async () => {
    try {
      if (getAuthToken()) {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // ignore logout error
    }
    setAuthToken(null);
    setUser(null);
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
    setModalMode(mode);
    setAuthError('');
    setModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setModalOpen(false);
    setAuthError('');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        openAuthModal,
        closeAuthModal,
        login,
        register,
        demoLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
      {modalOpen && (
        <AuthModal
          mode={modalMode}
          setMode={(m) => {
            setModalMode(m);
            setAuthError('');
          }}
          error={authError}
          setError={setAuthError}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onClose={closeAuthModal}
          onLogin={login}
          onRegister={register}
          onDemo={demoLogin}
        />
      )}
    </AuthContext.Provider>
  );
}

function AuthModal({
  mode,
  setMode,
  error,
  setError,
  submitting,
  setSubmitting,
  onClose,
  onLogin,
  onRegister,
  onDemo,
}: {
  mode: 'login' | 'register';
  setMode: (m: 'login' | 'register') => void;
  error: string;
  setError: (e: string) => void;
  submitting: boolean;
  setSubmitting: (s: boolean) => void;
  onClose: () => void;
  onLogin: (identifier: string, password: string) => Promise<void>;
  onRegister: (p: RegisterFormValues) => Promise<void>;
  onDemo: () => Promise<void>;
}) {
  const loginForm = useForm<LoginFormValues>({
    defaultValues: { identifier: '', password: '' },
  });

  const registerForm = useForm<RegisterFormValues>({
    defaultValues: {
      username: '',
      email: '',
      full_name: '',
      password: '',
      target_role: 'Python Backend Engineer',
    },
  });

  const handleLoginSubmit = loginForm.handleSubmit(async (data) => {
    setSubmitting(true);
    setError('');
    try {
      await onLogin(data.identifier, data.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  });

  const handleRegisterSubmit = registerForm.handleSubmit(async (data) => {
    setSubmitting(true);
    setError('');
    try {
      await onRegister(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  });

  const handleDemo = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onDemo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-[#14171D] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {mode === 'login' ? 'Sign In to Python Mastery' : 'Create Developer Account'}
              </h2>
              <p className="text-xs text-zinc-400">Persist code, submissions, bookmarks & mastery progress</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 rounded-md bg-[#0C0E12] p-1 border border-zinc-800">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`py-1.5 text-xs font-medium rounded transition-colors ${
                mode === 'login' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`py-1.5 text-xs font-medium rounded transition-colors ${
                mode === 'register' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Register
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email or Username</label>
                <div className="relative">
                  <Mail className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    {...loginForm.register('identifier', { required: 'Email or username is required' })}
                    type="text"
                    placeholder="alex@pythonmastery.dev"
                    className="w-full rounded-md border border-zinc-800 bg-[#0C0E12] pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    {...loginForm.register('password', { required: 'Password is required' })}
                    type="password"
                    placeholder="Enter your password"
                    className="w-full rounded-md border border-zinc-800 bg-[#0C0E12] pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 text-sm font-medium text-white transition-colors"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Username</label>
                  <input
                    {...registerForm.register('username', {
                      required: true,
                      minLength: 3,
                      pattern: /^[a-zA-Z0-9_]+$/,
                    })}
                    type="text"
                    placeholder="py_builder"
                    className="w-full rounded-md border border-zinc-800 bg-[#0C0E12] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="h-3.5 w-3.5 text-zinc-500 absolute left-2.5 top-2" />
                    <input
                      {...registerForm.register('full_name', { required: true, minLength: 2 })}
                      type="text"
                      placeholder="Jordan Patel"
                      className="w-full rounded-md border border-zinc-800 bg-[#0C0E12] pl-8 pr-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Email</label>
                <input
                  {...registerForm.register('email', { required: true })}
                  type="email"
                  placeholder="jordan@example.com"
                  className="w-full rounded-md border border-zinc-800 bg-[#0C0E12] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Target Role</label>
                <div className="relative">
                  <Briefcase className="h-3.5 w-3.5 text-zinc-500 absolute left-2.5 top-2" />
                  <select
                    {...registerForm.register('target_role')}
                    className="w-full rounded-md border border-zinc-800 bg-[#0C0E12] pl-8 pr-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Python Backend Engineer">Python Backend Engineer</option>
                    <option value="GenAI Engineer">GenAI Engineer</option>
                    <option value="Agentic AI Engineer">Agentic AI Engineer</option>
                    <option value="Python Platform Developer">Python Platform Developer</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Password (min 6 chars)</label>
                <input
                  {...registerForm.register('password', { required: true, minLength: 6 })}
                  type="password"
                  placeholder="Create a strong password"
                  className="w-full rounded-md border border-zinc-800 bg-[#0C0E12] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 text-sm font-medium text-white transition-colors"
              >
                {submitting ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}

          <div className="relative flex items-center py-1">
            <div className="grow border-t border-zinc-800" />
            <span className="mx-3 text-[11px] uppercase tracking-wider text-zinc-500">or quick start</span>
            <div className="grow border-t border-zinc-800" />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleDemo}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 py-2 px-3 text-xs font-medium text-zinc-200 transition-colors"
          >
            Sign In as Demo Developer (alex@pythonmastery.dev)
          </button>
        </div>
      </div>
    </div>
  );
}
