'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { GuildAccess, TrackHistoryEntry } from '@/lib/types';
import { Icon, type IconName } from '@/components/icons';
import { BackgroundWaveform } from '@/components/BackgroundWaveform';
import { usePlayer } from '@/context/PlayerContext';

interface DashboardStats {
  active_players: number;
  total_guilds: number;
  total_users: number;
  recent_tracks: TrackHistoryEntry[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const { state } = usePlayer();
  const track = state?.current_track;
  const isPlaying = !!(state && state.is_playing && !state.is_paused);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [guildsData, historyData, statsData] = await Promise.all([
          api.get<GuildAccess[]>('/guilds/my').catch(() => []),
          api.get<TrackHistoryEntry[]>('/history?limit=5').catch(() => []),
          api.get<{ total_users: number, active_players: number }>('/stats').catch(() => ({ total_users: 0, active_players: 0 })),
        ]);
        setStats({
          active_players: statsData?.active_players || 0,
          total_guilds: Array.isArray(guildsData) ? guildsData.length : 0,
          total_users: statsData?.total_users || 0,
          recent_tracks: Array.isArray(historyData) ? historyData : [],
        });
      } catch {
        setStats({ active_players: 0, total_guilds: 0, total_users: 0, recent_tracks: [] });
      }
    }

    void loadDashboard();
  }, []);

  const statCards: Array<{ label: string; value: string | number; icon: IconName; color: string }> = [
    { label: 'Active Players', value: stats?.active_players || 0, icon: 'music', color: 'from-amber-500/20 to-amber-600/10' },
    { label: 'Connected Servers', value: stats?.total_guilds || 0, icon: 'server', color: 'from-blue-500/20 to-blue-600/10' },
    { label: 'Total Users', value: stats?.total_users || 0, icon: 'users', color: 'from-emerald-500/20 to-emerald-600/10' },
    { label: 'System Status', value: 'Online', icon: 'check-circle', color: 'from-green-500/20 to-green-600/10' },
  ];

  return (
    <div className="absolute top-6 bottom-6 left-6 right-6 flex justify-center pointer-events-none animate-fade-in">
      <div className="w-full max-w-[1800px] h-full pointer-events-auto overflow-hidden rounded-[28px] bg-black text-white shadow-2xl ring-1 ring-white/10 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(217,119,6,0.25),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(180,83,9,0.15),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#050505_42%,_#000_100%)]" />

        <div className="relative z-10 flex flex-1 min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <section className="min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-[#121212]/90">
              
              {/* Top Gradient Banner */}
              <div className="relative overflow-hidden rounded-t-[22px] bg-gradient-to-br from-[#3d1c04] via-[#210f04] to-[#111111] p-4 md:p-6 lg:p-8">
                <div className="absolute inset-0 overflow-hidden rounded-t-[22px] pointer-events-none">
                  <BackgroundWaveform isPlaying={isPlaying} track={track} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,_rgba(245,158,11,0.15),_transparent_30%)]" />
                </div>
                
                <div className="relative">
                  <p className="text-sm font-semibold text-zinc-300">Overview</p>
                  <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl">Dashboard</h1>
                  <p className="mt-3 max-w-xl text-sm text-zinc-300">Monitor your Beehive music system, connected servers, and recent activity.</p>
                </div>

                {/* Stats Grid inside the banner to make it pop */}
                <div className="relative mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              </div>

              {/* Main Content Area */}
              <div className="p-4 md:p-6 lg:p-8 grid gap-6 lg:grid-cols-2">
                
                {/* Recent Activity */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black tracking-tight">Recent Activity</h2>
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Past 5 tracks</span>
                  </div>
                  
                  {stats?.recent_tracks && stats.recent_tracks.length > 0 ? (
                    <div className="space-y-2">
                      {stats.recent_tracks.map((track, i) => (
                        <div key={i} className="group flex items-center gap-4 rounded-xl bg-white/5 p-3 transition hover:bg-white/10 ring-1 ring-transparent hover:ring-white/10">
                          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-black/40 text-amber-400">
                            <Icon name="music" className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">{track.track_title}</p>
                            <p className="truncate text-xs text-zinc-400">{track.track_author || 'Unknown Artist'}</p>
                          </div>
                          <span className="text-xs font-medium text-zinc-500 whitespace-nowrap">
                            {new Date(track.played_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-white/10 bg-white/5">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-zinc-500">
                        <Icon name="headphones" className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-semibold text-zinc-300">No recent activity</p>
                      <p className="text-xs text-zinc-500 mt-1">Start playing music to see history</p>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black tracking-tight">Quick Actions</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Now Playing', desc: 'View live player', href: '/', icon: 'music' as IconName },
                      { label: 'Search', desc: 'Find new tracks', href: '/search', icon: 'search' as IconName },
                      { label: 'View Queue', desc: 'Manage upcoming', href: '/queue', icon: 'queue' as IconName },
                      { label: 'Playlists', desc: 'Your collections', href: '/playlists', icon: 'disc' as IconName },
                    ].map((action) => (
                      <a
                        key={action.href}
                        href={action.href}
                        className="group flex flex-col items-start p-4 rounded-2xl bg-white/5 hover:bg-white/10 ring-1 ring-white/5 hover:ring-amber-500/30 transition-all"
                      >
                        <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-amber-500/20 transition-transform">
                          <Icon name={action.icon} className="h-5 w-5 text-amber-400" />
                        </div>
                        <span className="text-sm font-semibold text-white">{action.label}</span>
                        <span className="text-xs text-zinc-400 mt-0.5">{action.desc}</span>
                      </a>
                    ))}
                  </div>
                </div>

              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
