'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Guild, TrackHistoryEntry } from '@/lib/types';
import { Icon } from '@/components/icons';
import { BackgroundWaveform } from '@/components/BackgroundWaveform';
import { usePlayer } from '@/context/PlayerContext';

interface ServerStats {
  total_playbacks: int;
  total_playlists: int;
  total_users: int;
  total_commands: int;
}

interface ServerSettings {
  autoplay_enabled: boolean;
  default_volume: number;
  loop_mode: string;
  max_queue_size: number | null;
  restricted_mode: boolean;
}

export default function ServerDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const guildId = Number(params.id);

  const [guild, setGuild] = useState<Guild | null>(null);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [history, setHistory] = useState<TrackHistoryEntry[]>([]);
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const { state } = usePlayer();
  const isPlaying = !!(state && state.is_playing && !state.is_paused && state.guild_id === guild?.discord_guild_id);
  const track = isPlaying ? state?.current_track : null;

  useEffect(() => {
    if (!guildId) return;

    async function loadData() {
      try {
        const guildData = await api.get<Guild>(`/guilds/${guildId}`);
        setGuild(guildData);

        // Load these independently so they don't break the page if backend isn't reloaded yet
        Promise.allSettled([
          api.get<ServerStats>(`/guilds/${guildId}/stats`),
          api.get<TrackHistoryEntry[]>(`/history/guild/${guildId}?limit=20`),
          api.get<ServerSettings>(`/guilds/${guildId}/settings`),
        ]).then(([statsRes, historyRes, settingsRes]) => {
          if (statsRes.status === 'fulfilled') setStats(statsRes.value);
          if (historyRes.status === 'fulfilled') setHistory(Array.isArray(historyRes.value) ? historyRes.value : []);
          if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value);
        });

      } catch (err: any) {
        console.error('Failed to load server data:', err);
        if (err.response?.status === 403) {
          router.push('/servers');
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [guildId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="loader" className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Icon name="server" className="w-12 h-12 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-zinc-300">Server Not Found</h2>
        <p className="text-zinc-500 mt-2">This server does not exist or you don't have access.</p>
        <Link href="/servers" className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
          Go Back
        </Link>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Playbacks', value: stats?.total_playbacks ?? 0, icon: 'music' as const, color: 'from-amber-500/20 to-amber-600/10' },
    { label: 'Total Playlists', value: stats?.total_playlists ?? 0, icon: 'list' as const, color: 'from-blue-500/20 to-blue-600/10' },
    { label: 'Total Users', value: stats?.total_users ?? 0, icon: 'users' as const, color: 'from-emerald-500/20 to-emerald-600/10' },
    { label: 'Commands Executed', value: stats?.total_commands ?? 0, icon: 'terminal' as const, color: 'from-purple-500/20 to-purple-600/10' },
  ];

  return (
    <div className="space-y-6 animate-slide-up relative pb-20">
      {/* Back button */}
      <Link href="/servers" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
        <Icon name="chevron-left" className="w-4 h-4" />
        Back to Servers
      </Link>

      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#3d1c04] via-[#210f04] to-[#111111] p-6 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,_rgba(245,158,11,0.15),_transparent_30%)]" />
        <div className="absolute inset-0 overflow-hidden rounded-[22px] pointer-events-none">
          <BackgroundWaveform isPlaying={isPlaying} track={track} />
        </div>
        
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden shrink-0 flex items-center justify-center text-4xl">
            {guild.icon_url ? (
              <Image src={guild.icon_url} alt={guild.name || 'Server'} width={128} height={128} className="object-cover w-full h-full" unoptimized />
            ) : (
              <Icon name="server" className="w-12 h-12 text-amber-500/50" />
            )}
          </div>
          <div>
            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-semibold tracking-wide uppercase mb-3 inline-block">
              Server Overview
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">{guild.name || 'Unknown Server'}</h1>
            <p className="mt-2 text-zinc-300 max-w-xl">
              Dashboard and analytics for this Discord server.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10 transition-colors hover:bg-black/40 overflow-hidden">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
              <Icon name={stat.icon} className="h-5 w-5 text-white" />
            </div>
            <p className="text-3xl font-black text-white">{stat.value}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Play History */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-zinc-100">Recent Playbacks</h2>
            <Icon name="music" className="w-5 h-5 text-zinc-500" />
          </div>
          {history.length > 0 ? (
            <div className="space-y-4">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                  <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden shrink-0 relative">
                    {entry.artwork_url ? (
                      <Image src={entry.artwork_url} alt="Artwork" fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-500">
                        <Icon name="music" className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-zinc-200 truncate">{entry.track_title}</h3>
                    <p className="text-sm text-zinc-400 truncate">{entry.track_author}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-zinc-500">
                      {new Date(entry.played_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {new Date(entry.played_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Icon name="clock" className="w-8 h-8 mx-auto text-zinc-600 mb-3" />
              <p className="text-zinc-400">No playback history recorded yet.</p>
            </div>
          )}
        </div>

        {/* Server Settings Info */}
        <div className="glass-card p-6 h-fit">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-zinc-100">Bot Settings</h2>
            <Icon name="settings" className="w-5 h-5 text-zinc-500" />
          </div>
          
          {settings ? (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-zinc-400">Autoplay</p>
                <p className="text-zinc-200 font-semibold">{settings.autoplay_enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Default Volume</p>
                <p className="text-zinc-200 font-semibold">{settings.default_volume}%</p>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Loop Mode</p>
                <p className="text-zinc-200 font-semibold capitalize">{settings.loop_mode}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Restricted Mode</p>
                <p className="text-zinc-200 font-semibold">{settings.restricted_mode ? 'On (DJ only)' : 'Off'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Queue Limit</p>
                <p className="text-zinc-200 font-semibold">{settings.max_queue_size || 'Unlimited'}</p>
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">Settings unavailable.</p>
          )}
        </div>
      </div>
    </div>
  );
}
