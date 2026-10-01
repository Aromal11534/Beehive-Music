'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { api, getApiBase } from '@/lib/api';
import type { SessionInfo } from '@/lib/types';
import { Icon, type IconName } from '@/components/icons';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { getCroppedImg } from '@/lib/cropUtils';

type SettingsTab = 'profile' | 'security' | 'preferences' | 'admin';

const baseTabs: Array<{ key: SettingsTab; label: string; description: string; icon: IconName }> = [
  { key: 'profile', label: 'Profile', description: 'Identity and avatar', icon: 'users' },
  { key: 'security', label: 'Security', description: 'Discord sign-in and sessions', icon: 'lock' },
  { key: 'preferences', label: 'Preferences', description: 'Playback defaults', icon: 'sliders' },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Request failed';
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const email = user?.email || '';
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Avatar Crop State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (tab === 'security') {
      api.get<SessionInfo[]>('/sessions')
        .then((data) => setSessions(Array.isArray(data) ? data : []))
        .catch((error: unknown) => setSessionError(errorMessage(error)))
        .finally(() => setSessionsLoading(false));
    }
  }, [tab]);

  const retrySessions = async () => {
    setSessionsLoading(true);
    setSessionError(null);
    try {
      const data = await api.get<SessionInfo[]>('/sessions');
      setSessions(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      setSessionError(errorMessage(error));
    } finally {
      setSessionsLoading(false);
    }
  };

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setImageToCrop(reader.result?.toString() || null);
      setCropModalOpen(true);
    });
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const onCropComplete = (_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const uploadCroppedAvatar = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;
    setIsSaving(true);
    try {
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
      if (!croppedImage) throw new Error('Failed to crop image');
      const form = new FormData();
      form.append('file', croppedImage);
      
      await api.upload('/avatars/upload', form);
      await refreshUser();
      setMessage('Avatar uploaded successfully.');
      setCropModalOpen(false);
      setImageToCrop(null);
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    } finally {
      setIsSaving(false);
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

  const wipeSystemData = async () => {
    if (!confirm('Are you absolutely sure you want to wipe all system logs, playlists, and favorites? This cannot be undone.')) return;
    setIsSaving(true);
    setMessage('');
    try {
      const res = await api.post<{ message?: string }>('/admin/wipe-data');
      setMessage(res.message || 'System data wiped successfully.');
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [...baseTabs];
  if (user?.is_admin) {
    tabs.splice(2, 0, { key: 'admin', label: 'Admin Actions', description: 'System wipes and data management', icon: 'settings' });
  }

  const initials = user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?';
  
  const avatarFilename = user?.avatar_path ? user.avatar_path.split(/[/\\]/).pop() : null;
  const avatarUrl = avatarFilename ? `${getApiBase()}/avatars/${avatarFilename}` : null;

  return (
    <>
      <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage your Beehive identity, Discord sign-in sessions, and default music preferences.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit glass-card p-3 xl:sticky xl:top-0">
                <div className="px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Sections</p>
                </div>
                <div className="space-y-1">
                  {tabs.map((item) => {
                    const isActive = item.key === tab;
                    return (
                      <button
                        key={item.key}
                        onClick={() => { setTab(item.key); setMessage(''); }}
                        className={`group w-full rounded-2xl p-4 text-left transition ${isActive ? 'bg-white text-zinc-950 shadow-lg shadow-white/10' : 'text-zinc-300 hover:bg-white/8'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-zinc-950/10' : 'bg-black/35 text-zinc-400 group-hover:bg-black/55'}`}>
                            <Icon name={item.icon} className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-sm">{item.label}</p>
                            <p className={`mt-0.5 text-xs truncate ${isActive ? 'text-zinc-900/70' : 'text-zinc-500'}`}>{item.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <main className="min-w-0 space-y-5">
                {message ? (
                  <div className="flex justify-end">
                    <div className="shrink-0 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-zinc-200">
                      {message}
                    </div>
                  </div>
                ) : null}

                {tab === 'profile' ? (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="glass-card p-5 md:p-6">
                      <h3 className="text-lg font-black">Profile Details</h3>
                      <p className="mt-1 text-sm text-zinc-500">Update the name and email shown in the web panel.</p>

                      <div className="mt-6 grid gap-5">
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-400">Display Name</span>
                          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-zinc-100 outline-none transition focus:border-white/50 focus:ring-2 focus:ring-white/10" />
                        </label>

                        <label className="block">
                          <span className="text-sm font-medium text-zinc-400">Email Address (Read Only)</span>
                          <input type="email" value={email} readOnly className="mt-2 w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-zinc-500 outline-none cursor-not-allowed" />
                        </label>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button onClick={saveProfile} disabled={isSaving} className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">
                          {isSaving ? 'Saving...' : 'Save Profile'}
                        </button>
                      </div>
                    </div>

                    <div className="glass-card p-6 flex flex-col items-center justify-center text-center gap-4">
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-5xl font-black text-zinc-400 shadow-2xl shadow-black/20 overflow-hidden">
                        {avatarUrl ? (
                          <Image src={avatarUrl} alt="Avatar" width={96} height={96} unoptimized className="w-full h-full object-cover" />
                        ) : (
                          initials
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <h3 className="text-lg font-black">{user?.display_name || 'Beehive User'}</h3>
                        <p className="text-sm text-zinc-500">@{user?.username}</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/15">
                        <Icon name="plus" className="h-4 w-4" />
                        Upload Avatar
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                      </label>
                    </div>
                  </div>
                ) : null}

                {tab === 'security' ? (
                  <div className="grid gap-5">
                    <div className="glass-card p-5 md:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-black">Discord Authentication</h3>
                          <p className="mt-1 text-sm text-zinc-500">This account signs in through Discord. Password and authenticator settings are managed by Discord.</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-black text-indigo-300">Discord only</span>
                      </div>
                    </div>

                    <div className="glass-card p-5 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-black">Active Sessions</h3>
                          <p className="mt-1 text-sm text-zinc-500">Review devices currently signed in to this account.</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-400">{sessionsLoading ? 'Loading…' : `${sessions.length} active`}</span>
                      </div>

                      <div className="mt-5 space-y-3">
                        {sessionError ? (
                          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                            <p>{sessionError}</p>
                            <button onClick={() => void retrySessions()} className="mt-3 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15">Try again</button>
                          </div>
                        ) : null}
                        {sessionsLoading ? (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-500">Loading active sessions...</div>
                        ) : sessions.length > 0 ? sessions.map((session) => (
                          <div key={session.id} className="flex flex-col gap-3 rounded-2xl bg-black/30 p-4 ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-zinc-200">{session.ip_address || 'Unknown IP'}</p>
                              <p className="mt-1 truncate text-xs text-zinc-500">{session.user_agent || 'Unknown device'}</p>
                            </div>
                            <button onClick={() => revokeSession(session.id)} className="shrink-0 self-start rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 transition hover:bg-red-500/20 sm:self-auto">
                              Revoke
                            </button>
                          </div>
                        )) : (
                          !sessionError ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-500">No active sessions found.</div> : null
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {tab === 'preferences' ? (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="glass-card p-5 md:p-6">
                      <h3 className="text-lg font-black">Playback Defaults</h3>
                      <p className="mt-1 text-sm text-zinc-500">Personal playback defaults are not persisted yet. Use the live player controls for the current Discord session.</p>
                    </div>

                    <div className="glass-card p-5 md:p-6">
                      <h3 className="text-lg font-black">More Controls</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-500">Server-specific playback defaults, notification preferences, and UI personalization can be added here when the API supports persisted preferences.</p>
                    </div>
                  </div>
                ) : null}

                {tab === 'admin' && user?.is_admin ? (
                  <div className="grid gap-5">
                    <div className="glass-card p-5 md:p-6 border border-red-500/20 bg-red-500/5">
                      <h3 className="text-lg font-black text-red-400">Wipe System Data</h3>
                      <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                        This action will permanently delete all non-critical data across the entire system. 
                        <strong className="text-zinc-300"> User accounts, Discord server configurations, and active sessions will be preserved.</strong>
                      </p>
                      <ul className="mt-4 list-disc pl-5 text-sm text-zinc-500 space-y-1">
                        <li>All user Personal Playlists</li>
                        <li>All user Favorites</li>
                        <li>System Play History & Audit Logs</li>
                      </ul>
                      <div className="mt-6 pt-6 border-t border-red-500/10">
                        <button 
                          onClick={wipeSystemData} 
                          disabled={isSaving} 
                          className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-black text-white transition hover:bg-red-400 disabled:opacity-50"
                        >
                          {isSaving ? 'Wiping Data...' : 'Wipe System Data'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </main>
            </div>
    </div>

      {cropModalOpen && imageToCrop && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#111] p-6 ring-1 ring-white/10 shadow-2xl flex flex-col gap-6">
            <h2 className="text-2xl font-black">Crop Avatar</h2>
            <div className="relative w-full h-64 bg-black rounded-xl overflow-hidden">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setCropModalOpen(false); setImageToCrop(null); }} className="flex-1 rounded-full bg-white/10 px-5 py-2.5 text-sm font-black text-zinc-300 transition hover:bg-white/15">Cancel</button>
              <button onClick={uploadCroppedAvatar} disabled={isSaving} className="flex-1 rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50">Upload</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
