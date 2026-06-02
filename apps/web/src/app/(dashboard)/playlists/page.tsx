'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PlaylistSummary, PlaylistDetail, PlaylistTrack } from '@/lib/types';
import { Icon } from '@/components/icons';
import { useGuilds } from '@/context/GuildContext';
import Image from 'next/image';

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistDetail | null>(null);
  const { selectedGuild } = useGuilds();
  const [feedbackId, setFeedbackId] = useState<string | null>(null);

  useEffect(() => {
    api.get<PlaylistSummary[]>('/playlists').then(setPlaylists).catch(() => {});
  }, []);

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    try {
      await api.post('/playlists', { name: newName, playlist_type: 'personal' });
      setNewName('');
      setShowCreate(false);
      api.get<PlaylistSummary[]>('/playlists').then(setPlaylists);
    } catch {}
  };

  const loadPlaylist = async (id: number) => {
    try {
      const data = await api.get<PlaylistDetail>(`/playlists/${id}`);
      setSelectedPlaylist(data);
    } catch {}
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const handlePlay = async (track: PlaylistTrack, action: 'play' | 'queue') => {
    if (!selectedGuild) return alert("Please select a server at the top right.");
    try {
      await api.post('/player/play', {
        guild_id: selectedGuild,
        track: {
          title: track.track_title,
          author: track.track_author || 'Unknown Artist',
          url: track.track_url,
          identifier: track.track_url,
          duration: track.duration_ms || 0,
          artwork_url: track.artwork_url,
          source: 'unknown',
        },
        action,
      });
      setFeedbackId(`${track.id}-${action}`);
      setTimeout(() => setFeedbackId(null), 2000);
    } catch {
      alert("Failed to play track.");
    }
  };

  const handleRemoveTrack = async (trackId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedPlaylist) return;
    try {
      await api.delete(`/playlists/${selectedPlaylist.id}/tracks/${trackId}`);
      loadPlaylist(selectedPlaylist.id);
    } catch {
      alert("Failed to remove track.");
    }
  };

  return (
    <div className="absolute top-6 bottom-6 left-6 right-6 flex justify-center pointer-events-none animate-fade-in">
      <div className="w-full max-w-[1800px] h-full pointer-events-auto overflow-hidden rounded-[28px] bg-black text-white shadow-2xl ring-1 ring-white/10 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(4,120,87,0.25),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(3,105,161,0.15),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#050505_42%,_#000_100%)]" />

        <div className="relative z-10 flex flex-1 min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <section className="min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-[#121212]/90 flex flex-col">
              
              {/* Top Gradient Banner */}
              <div className="relative overflow-hidden rounded-t-[22px] shrink-0 bg-gradient-to-br from-[#064e3b] via-[#022c22] to-[#111111] p-4 md:p-6 lg:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,_rgba(16,185,129,0.15),_transparent_30%)]" />
                
                <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    {selectedPlaylist ? (
                      <button onClick={() => setSelectedPlaylist(null)} className="mb-2 text-emerald-400 hover:text-emerald-300 flex items-center gap-2 text-sm font-bold transition">
                        <Icon name="arrow-left" className="w-4 h-4" /> Back to Playlists
                      </button>
                    ) : (
                      <p className="text-sm font-semibold text-zinc-300">Your Collection</p>
                    )}
                    <h1 className="mt-1 text-4xl font-black tracking-tight text-white md:text-5xl">
                      {selectedPlaylist ? selectedPlaylist.name : 'Playlists'}
                    </h1>
                    <p className="mt-3 max-w-xl text-sm text-zinc-300">
                      {selectedPlaylist 
                        ? `${selectedPlaylist.track_count || 0} tracks • ${selectedPlaylist.playlist_type}` 
                        : 'Create, manage, and play your personal and server music collections.'}
                    </p>
                  </div>
                  {!selectedPlaylist && (
                    <button
                      onClick={() => setShowCreate(!showCreate)}
                      className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-emerald-950 font-bold rounded-xl text-sm hover:from-emerald-400 hover:to-emerald-500 transition shadow-lg shrink-0"
                    >
                      + Create Playlist
                    </button>
                  )}
                </div>
              </div>

              {/* Main Content Area */}
              <div className="p-4 md:p-6 lg:p-8 flex-1 min-h-0">
                {selectedPlaylist ? (
                  <div className="space-y-2">
                    {selectedPlaylist.tracks?.length > 0 ? (
                      selectedPlaylist.tracks.map((t, i) => (
                        <div key={t.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group">
                          <span className="w-6 text-center text-sm font-medium text-zinc-500 group-hover:text-white">{i + 1}</span>
                          <div className="w-12 h-12 rounded bg-zinc-800 shrink-0 overflow-hidden relative">
                            {t.artwork_url ? (
                              <Image unoptimized src={t.artwork_url} alt="" fill className="object-cover" sizes="48px" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-emerald-500/50"><Icon name="music" className="h-5 w-5" /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition">{t.track_title}</p>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">{t.track_author || 'Unknown Artist'}</p>
                          </div>
                          
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handlePlay(t, 'play')} className="p-2 rounded-full hover:bg-emerald-500 hover:text-emerald-950 text-zinc-300 transition" title="Play Now">
                              {feedbackId === `${t.id}-play` ? <Icon name="check-circle" className="w-4 h-4" /> : <Icon name="play" className="w-4 h-4" />}
                            </button>
                            <button onClick={() => handlePlay(t, 'queue')} className="p-2 rounded-full hover:bg-white/10 text-zinc-300 transition" title="Add to Queue">
                              {feedbackId === `${t.id}-queue` ? <Icon name="check-circle" className="w-4 h-4 text-emerald-400" /> : <Icon name="plus" className="w-4 h-4" />}
                            </button>
                            <button onClick={(e) => handleRemoveTrack(t.id, e)} className="p-2 rounded-full hover:bg-red-500/20 hover:text-red-400 text-zinc-500 transition" title="Remove from Playlist">
                              <Icon name="x" className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="text-xs text-zinc-500 font-medium tabular-nums w-12 text-right">
                            {t.duration_ms ? formatDuration(t.duration_ms) : '--:--'}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-20 text-center">
                        <p className="text-zinc-400">This playlist is empty.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {showCreate && (
                      <div className="mb-6 rounded-2xl bg-black/25 p-4 ring-1 ring-emerald-500/30 flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Enter playlist name..."
                          className="flex-1 px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          autoFocus
                        />
                        <button onClick={createPlaylist} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 transition text-emerald-950 rounded-xl font-bold">
                          Save
                        </button>
                      </div>
                    )}

                    {playlists.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {playlists.map((p) => (
                          <div key={p.id} onClick={() => loadPlaylist(p.id)} className="group rounded-2xl bg-white/5 p-5 ring-1 ring-white/5 transition hover:bg-white/10 hover:ring-emerald-500/30 cursor-pointer">
                            <div className="w-14 h-14 rounded-xl bg-black/40 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all text-emerald-400">
                              <Icon name="disc" className="h-7 w-7" />
                            </div>
                            <h3 className="font-bold text-lg text-white truncate">{p.name}</h3>
                            <p className="text-sm font-medium text-zinc-400 mt-1 uppercase tracking-wider text-xs">
                              {p.track_count || 0} tracks • {p.playlist_type}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-white/10 bg-white/5 h-full min-h-[300px]">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-emerald-500/50">
                          <Icon name="disc" className="h-8 w-8" />
                        </div>
                        <h2 className="text-xl font-black text-white">No Playlists Yet</h2>
                        <p className="text-sm text-zinc-400 mt-2 max-w-md text-center">Create your first playlist to start saving your favorite tracks for quick access later.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
