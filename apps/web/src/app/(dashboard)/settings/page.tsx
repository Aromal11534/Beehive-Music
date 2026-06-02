'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { MfaStatus, SessionInfo } from '@/lib/types';
import { Icon, type IconName } from '@/components/icons';

type SettingsTab = 'profile' | 'security' | 'preferences';

const tabs: Array<{ key: SettingsTab; label: string; description: string; icon: IconName }> = [
  { key: 'profile', label: 'Profile', description: 'Identity and avatar', icon: 'users' },
  { key: 'security', label: 'Security', description: 'Password, MFA, sessions', icon: 'lock' },
  { key: 'preferences', label: 'Preferences', description: 'Playback defaults', icon: 'sliders' },
];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (tab === 'security') {
      api.get<MfaStatus>('/mfa/status').then(setMfaStatus).catch(() => {});
      api.get<SessionInfo[]>('/sessions').then((data) => setSessions(Array.isArray(data) ? data : [])).catch(() => {});
    }
  }, [tab]);

  const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Request failed';

  const saveProfile = async () => {
    setIsSaving(true);
    setMessage('');
    try {
      await api.patch('/users/me', { display_name: displayName, email: email || null });
      await refreshUser();
      setMessage('Profile updated successfully.');
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const changePassword = async () => {
    setIsSaving(true);
    setMessage('');
    try {
      await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password changed successfully.');
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setMessage('');
    try {
      await api.upload('/avatars/upload', form);
      await refreshUser();
      setMessage('Avatar uploaded successfully.');
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    }
  };

  const revokeSession = async (id: number) => {
    try {
      await api.delete(`/sessions/${id}`);
      setSessions((prev) => prev.filter((session) => session.id !== id));
      setMessage('Session revoked.');
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    }
  };

  const activeTab = tabs.find((item) => item.key === tab) || tabs[0];
  const initials = user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?';

  return (
    <div className="absolute top-6 bottom-6 left-6 right-6 flex justify-center pointer-events-none animate-fade-in">
      <div className="w-full max-w-[1800px] h-full pointer-events-auto overflow-hidden rounded-[28px] bg-black text-white shadow-2xl ring-1 ring-white/10 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.24),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(39,39,42,0.55),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#050505_42%,_#000_100%)]" />

        <section className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px]">
          <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#3d1c04] via-[#201006] to-[#111111] p-5 md:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,_rgba(251,191,36,0.16),_transparent_28%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300/80">Account Control</p>
                <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">Settings</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">Manage your Beehive identity, security controls, active sessions, and default music preferences.</p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-black/30 p-3 ring-1 ring-white/10 backdrop-blur">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400 text-xl font-black text-zinc-950 shadow-lg shadow-amber-500/20">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">{user?.display_name || 'Beehive User'}</p>
                  <p className="truncate text-xs text-zinc-400">@{user?.username || 'user'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="rounded-3xl bg-white/[0.04] p-3 ring-1 ring-white/10 backdrop-blur xl:sticky xl:top-0 xl:self-start">
                <div className="px-3 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Sections</p>
                </div>
                <div className="space-y-2">
                  {tabs.map((item) => {
                    const isActive = item.key === tab;
                    return (
                      <button
                        key={item.key}
                        onClick={() => { setTab(item.key); setMessage(''); }}
                        className={`group w-full rounded-2xl p-4 text-left transition ${isActive ? 'bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/15' : 'text-zinc-300 hover:bg-white/8'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? 'bg-zinc-950/10' : 'bg-black/35 text-amber-300 group-hover:bg-black/55'}`}>
                            <Icon name={item.icon} className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-black">{item.label}</p>
                            <p className={`mt-0.5 text-xs ${isActive ? 'text-zinc-900/70' : 'text-zinc-500'}`}>{item.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <main className="min-w-0 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Current Section</p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight">{activeTab.label}</h2>
                  </div>
                  {message ? (
                    <div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-300">
                      {message}
                    </div>
                  ) : null}
                </div>

                {tab === 'profile' ? (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="rounded-3xl bg-[#181818] p-5 ring-1 ring-white/10 md:p-6">
                      <h3 className="text-lg font-black">Profile Details</h3>
                      <p className="mt-1 text-sm text-zinc-500">Update the name and email shown in the web panel.</p>

                      <div className="mt-6 grid gap-5">
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-400">Display Name</span>
                          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10" />
                        </label>

                        <label className="block">
                          <span className="text-sm font-medium text-zinc-400">Email Address</span>
                          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10" />
                        </label>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button onClick={saveProfile} disabled={isSaving} className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60">
                          {isSaving ? 'Saving...' : 'Save Profile'}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/10 md:p-6">
                      <div className="flex flex-col items-center text-center">
                        <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-300 to-amber-600 text-5xl font-black text-zinc-950 shadow-2xl shadow-amber-500/20">
                          {initials}
                        </div>
                        <h3 className="mt-5 text-xl font-black">{user?.display_name || 'Beehive User'}</h3>
                        <p className="mt-1 text-sm text-zinc-500">@{user?.username}</p>
                        <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/15">
                          <Icon name="plus" className="h-4 w-4" />
                          Upload Avatar
                          <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
                        </label>
                      </div>
                    </div>
                  </div>
                ) : null}

                {tab === 'security' ? (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="rounded-3xl bg-[#181818] p-5 ring-1 ring-white/10 md:p-6">
                      <h3 className="text-lg font-black">Change Password</h3>
                      <p className="mt-1 text-sm text-zinc-500">Use a strong password with at least 8 characters.</p>
                      <div className="mt-6 space-y-4">
                        <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10" />
                        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10" />
                        <button onClick={changePassword} disabled={isSaving || !currentPassword || !newPassword} className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60">
                          Change Password
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[#181818] p-5 ring-1 ring-white/10 md:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-black">Two-Factor Authentication</h3>
                          <p className="mt-1 text-sm text-zinc-500">Add an authenticator code to protect your account.</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${mfaStatus?.is_enabled ? 'bg-emerald-400/10 text-emerald-300' : 'bg-zinc-700/50 text-zinc-400'}`}>
                          {mfaStatus?.is_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <button className="mt-6 rounded-full bg-white/10 px-5 py-2.5 text-sm font-black text-zinc-300 transition hover:bg-white/15">
                        {mfaStatus?.is_enabled ? 'Manage MFA' : 'Set Up MFA'}
                      </button>
                    </div>

                    <div className="rounded-3xl bg-[#181818] p-5 ring-1 ring-white/10 md:col-span-2 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-black">Active Sessions</h3>
                          <p className="mt-1 text-sm text-zinc-500">Review devices currently signed in to this account.</p>
                        </div>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-400">{sessions.length} active</span>
                      </div>

                      <div className="mt-5 space-y-3">
                        {sessions.length > 0 ? sessions.map((session) => (
                          <div key={session.id} className="flex flex-col gap-3 rounded-2xl bg-black/30 p-4 ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-zinc-200">{session.ip_address || 'Unknown IP'}</p>
                              <p className="mt-1 truncate text-xs text-zinc-500">{session.user_agent || 'Unknown device'}</p>
                            </div>
                            <button onClick={() => revokeSession(session.id)} className="self-start rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 transition hover:bg-red-500/20 sm:self-auto">
                              Revoke
                            </button>
                          </div>
                        )) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-500">No active sessions found.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {tab === 'preferences' ? (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="rounded-3xl bg-[#181818] p-5 ring-1 ring-white/10 md:p-6">
                      <h3 className="text-lg font-black">Playback Defaults</h3>
                      <p className="mt-1 text-sm text-zinc-500">Default preferences for future sessions.</p>
                      <label className="mt-6 block">
                        <span className="text-sm font-medium text-zinc-400">Default Volume</span>
                        <input type="range" min="0" max="100" defaultValue="80" className="mt-4 w-full accent-amber-400" />
                      </label>
                    </div>

                    <div className="rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/10 md:p-6">
                      <h3 className="text-lg font-black">More Controls</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-500">Server-specific playback defaults, notification preferences, and UI personalization can be added here when the API supports persisted preferences.</p>
                    </div>
                  </div>
                ) : null}
              </main>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
