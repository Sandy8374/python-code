import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Check, Lock, User } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

interface ProfileFormValues {
  full_name: string;
  target_role: string;
  bio: string;
}

interface PasswordFormValues {
  current_password: string;
  new_password: string;
}

export function ProfilePage() {
  const { user, refreshUser, openAuthModal } = useAuth();
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: {
      full_name: user?.full_name || '',
      target_role: user?.target_role || 'Python Backend Engineer',
      bio: user?.bio || '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: { current_password: '', new_password: '' },
  });

  useEffect(() => {
    if (user) {
      profileForm.reset({
        full_name: user.full_name,
        target_role: user.target_role,
        bio: user.bio,
      });
    }
  }, [user, profileForm]);

  if (!user) {
    return (
      <Layout>
        <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-8 text-center space-y-3 max-w-lg mx-auto mt-10">
          <User className="h-8 w-8 text-zinc-500 mx-auto" />
          <h1 className="text-lg font-semibold text-white">Developer Profile</h1>
          <p className="text-xs text-zinc-400">Sign in to manage your developer profile, target role, and security settings.</p>
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white"
          >
            Sign In
          </button>
        </div>
      </Layout>
    );
  }

  const onProfileSubmit = profileForm.handleSubmit(async (data) => {
    setProfileError('');
    setProfileSaved(false);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      await refreshUser();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  });

  const onPasswordSubmit = passwordForm.handleSubmit(async (data) => {
    setPwdError('');
    setPwdMsg('');
    try {
      await apiFetch('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      passwordForm.reset();
      setPwdMsg('Password updated successfully.');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Failed to update password');
    }
  });

  return (
    <Layout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Developer Profile</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Manage your identity and career interview track.</p>
        </div>

        {/* Profile Overview Header */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 flex items-center gap-4">
          <img
            src={user.avatar_url || '/src/assets/images/avatar_python_engineer_1794809909403.jpg'}
            alt={user.full_name}
            className="h-16 w-16 rounded-full object-cover border border-zinc-700 bg-zinc-900 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-base font-semibold text-white truncate">{user.full_name}</div>
            <div className="text-xs text-zinc-400 truncate">
              @{user.username} · {user.email}
            </div>
            <div className="text-xs text-blue-400 mt-1">{user.target_role}</div>
          </div>
        </div>

        {/* Profile Details Form */}
        <form onSubmit={onProfileSubmit} className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Profile Information</h2>

          {profileError && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {profileError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Full Name</label>
              <input
                {...profileForm.register('full_name', { required: true, minLength: 2 })}
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Target Interview Role</label>
              <select
                {...profileForm.register('target_role')}
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="Python Backend Engineer">Python Backend Engineer</option>
                <option value="GenAI Engineer">GenAI Engineer</option>
                <option value="Agentic AI Engineer">Agentic AI Engineer</option>
                <option value="Python Platform Developer">Python Platform Developer</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Developer Bio</label>
            <textarea
              {...profileForm.register('bio')}
              rows={3}
              className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white"
            >
              {profileSaved && <Check className="h-3.5 w-3.5" />}
              {profileSaved ? 'Profile Updated' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Change Password Form */}
        <form onSubmit={onPasswordSubmit} className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-white">Change Password</h2>
          </div>

          {pwdError && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {pwdError}
            </div>
          )}
          {pwdMsg && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              {pwdMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Current Password</label>
              <input
                {...passwordForm.register('current_password', { required: true })}
                type="password"
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">New Password (min 6 chars)</label>
              <input
                {...passwordForm.register('new_password', { required: true, minLength: 6 })}
                type="password"
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-200"
          >
            Update Password
          </button>
        </form>
      </div>
    </Layout>
  );
}
