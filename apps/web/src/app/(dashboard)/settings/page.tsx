'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, getApiBase } from '@/lib/api';
import type { MfaStatus, SessionInfo } from '@/lib/types';
import { Icon, type IconName } from '@/components/icons';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '@/lib/cropUtils';

type SettingsTab = 'profile' | 'security' | 'preferences' | 'admin';

const baseTabs: Array<{ key: SettingsTab; label: string; description: string; icon: IconName }> = [
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

  // MFA State
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [mfaModalMode, setMfaModalMode] = useState<'setup' | 'disable' | null>(null);
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; qr_code_base64: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[] | null>(null);

  // Avatar Crop State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

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

  const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
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
      const res = await api.post<any>('/admin/wipe-data');
      setMessage(res.message || 'System data wiped successfully.');
    } catch (err: unknown) {
      setMessage(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const startMfaSetup = async () => {
    setMessage('');
    try {
      const data = await api.post<{ secret: string; qr_code_base64: string }>('/mfa/setup');
      setMfaSetupData(data);
      setMfaModalMode('setup');
      setIsMfaModalOpen(true);
      setMfaRecoveryCodes(null);
      setMfaCode('');
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    }
  };

  const enableMfa = async () => {
    if (!mfaSetupData || !mfaCode) return;
    setIsSaving(true);
    try {
      const res = await api.post<{ detail: string }>('/mfa/enable', { code: mfaCode, secret: mfaSetupData.secret });
      const codes = res.detail.split(',');
      setMfaRecoveryCodes(codes);
      setMfaStatus({ is_enabled: true });
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const startMfaDisable = () => {
    setMfaModalMode('disable');
    setIsMfaModalOpen(true);
    setMfaCode('');
    setMfaPassword('');
    setMfaRecoveryCodes(null);
  };

  const disableMfa = async () => {
    if (!mfaCode || !mfaPassword) return;
    setIsSaving(true);
    try {
      await api.post('/mfa/disable', { code: mfaCode, password: mfaPassword });
      setMfaStatus({ is_enabled: false });
      closeMfaModal();
      setMessage('MFA disabled successfully.');
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const closeMfaModal = () => {
    setIsMfaModalOpen(false);
    setMfaSetupData(null);
    setMfaRecoveryCodes(null);
    setMfaCode('');
    setMfaPassword('');
  };

  const tabs = [...baseTabs];
  if (user?.is_admin) {
    tabs.splice(2, 0, { key: 'admin', label: 'Admin Actions', description: 'System wipes and data management', icon: 'settings' });
  }

  const activeTab = tabs.find((item) => item.key === tab) || tabs[0];
  const initials = user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?';
  
  const avatarFilename = user?.avatar_path ? user.avatar_path.split(/[/\\]/).pop() : null;
  const avatarUrl = avatarFilename ? `${getApiBase()}/avatars/${avatarFilename}` : null;

  return (
    <>
      <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage your Beehive identity, security controls, active sessions, and default music preferences.</p>
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
                          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
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
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="glass-card p-5 md:p-6">
                      <h3 className="text-lg font-black">Change Password</h3>
                      <p className="mt-1 text-sm text-zinc-500">Use a strong password with at least 8 characters.</p>
                      <div className="mt-6 space-y-4">
                        <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/50 focus:ring-2 focus:ring-white/10" />
                        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/50 focus:ring-2 focus:ring-white/10" />
                        <button onClick={changePassword} disabled={isSaving || !currentPassword || !newPassword} className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">
                          Change Password
                        </button>
                      </div>
                    </div>

                    <div className="glass-card p-5 md:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-lg font-black">Two-Factor Authentication</h3>
                          <p className="mt-1 text-sm text-zinc-500">Add an authenticator code to protect your account.</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${mfaStatus?.is_enabled ? 'bg-emerald-400/10 text-emerald-300' : 'bg-zinc-700/50 text-zinc-400'}`}>
                          {mfaStatus?.is_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <button onClick={mfaStatus?.is_enabled ? startMfaDisable : startMfaSetup} className="mt-6 rounded-full bg-white/10 px-5 py-2.5 text-sm font-black text-zinc-300 transition hover:bg-white/15">
                        {mfaStatus?.is_enabled ? 'Manage MFA' : 'Set Up MFA'}
                      </button>
                    </div>

                    <div className="glass-card p-5 lg:col-span-2 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-black">Active Sessions</h3>
                          <p className="mt-1 text-sm text-zinc-500">Review devices currently signed in to this account.</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-400">{sessions.length} active</span>
                      </div>

                      <div className="mt-5 space-y-3">
                        {sessions.length > 0 ? sessions.map((session) => (
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
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-500">No active sessions found.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {tab === 'preferences' ? (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="glass-card p-5 md:p-6">
                      <h3 className="text-lg font-black">Playback Defaults</h3>
                      <p className="mt-1 text-sm text-zinc-500">Default preferences for future sessions.</p>
                      <label className="mt-6 block">
                        <span className="text-sm font-medium text-zinc-400">Default Volume</span>
                        <input type="range" min="0" max="100" defaultValue="80" className="mt-4 w-full accent-white" />
                      </label>
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

      {isMfaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#111] p-6 ring-1 ring-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#2a1708] to-transparent opacity-50 pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-2xl font-black mb-4">
                {mfaModalMode === 'setup' && !mfaRecoveryCodes ? 'Set Up MFA' : ''}
                {mfaModalMode === 'setup' && mfaRecoveryCodes ? 'MFA Enabled' : ''}
                {mfaModalMode === 'disable' ? 'Disable MFA' : ''}
              </h2>

              {mfaModalMode === 'setup' && !mfaRecoveryCodes && mfaSetupData && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">Scan this QR code with your authenticator app (like Authy or Google Authenticator).</p>
                  <div className="bg-white p-4 rounded-2xl flex justify-center w-fit mx-auto">
                    <img src={`data:image/png;base64,${mfaSetupData.qr_code_base64}`} alt="MFA QR Code" className="w-48 h-48" />
                  </div>
                  <p className="text-xs text-center text-zinc-500 font-mono bg-black/50 p-2 rounded-lg break-all">
                    {mfaSetupData.secret}
                  </p>
                  <input
                    type="text"
                    placeholder="6-digit code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    maxLength={6}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-center text-xl tracking-[0.5em] text-zinc-100 outline-none transition focus:border-white/50"
                  />
                  <div className="flex gap-3 mt-6">
                    <button onClick={closeMfaModal} className="flex-1 rounded-full bg-white/10 px-5 py-2.5 text-sm font-black text-zinc-300 transition hover:bg-white/15">Cancel</button>
                    <button onClick={enableMfa} disabled={isSaving || mfaCode.length !== 6} className="flex-1 rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50">Verify</button>
                  </div>
                </div>
              )}

              {mfaModalMode === 'setup' && mfaRecoveryCodes && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-400 text-sm font-semibold text-center">
                    Authenticator app configured successfully.
                  </div>
                  <p className="text-sm text-zinc-400">Please save these recovery codes in a secure place. If you lose your device, you will need them to access your account.</p>
                  <div className="grid grid-cols-2 gap-2 bg-black/50 p-4 rounded-2xl">
                    {mfaRecoveryCodes.map((code) => (
                      <code key={code} className="text-sm text-zinc-300 font-mono text-center">{code}</code>
                    ))}
                  </div>
                  <button onClick={closeMfaModal} className="w-full mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-zinc-200">I have saved them</button>
                </div>
              )}

              {mfaModalMode === 'disable' && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">Enter your password and a current authenticator code to disable Two-Factor Authentication.</p>
                  <input
                    type="password"
                    placeholder="Password"
                    value={mfaPassword}
                    onChange={(e) => setMfaPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-zinc-100 outline-none transition focus:border-white/50"
                  />
                  <input
                    type="text"
                    placeholder="6-digit code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    maxLength={6}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-center text-xl tracking-[0.5em] text-zinc-100 outline-none transition focus:border-white/50"
                  />
                  <div className="flex gap-3 mt-6">
                    <button onClick={closeMfaModal} className="flex-1 rounded-full bg-white/10 px-5 py-2.5 text-sm font-black text-zinc-300 transition hover:bg-white/15">Cancel</button>
                    <button onClick={disableMfa} disabled={isSaving || !mfaPassword || mfaCode.length !== 6} className="flex-1 rounded-full bg-red-500 text-white px-5 py-2.5 text-sm font-black transition hover:bg-red-400 disabled:opacity-50">Disable MFA</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
