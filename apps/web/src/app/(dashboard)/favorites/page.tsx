'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { FavoriteTrack } from '@/lib/types';
import { Icon } from '@/components/icons';
import { useGuilds } from '@/context/GuildContext';
import Image from 'next/image';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const { selectedGuild } = useGuilds();
  const [feedbackId, setFeedbackId] = useState<string | null>(null);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = () => {
    api.get<FavoriteTrack[]>('/favorites').then(setFavorites).catch(() => {});
  };

  const removeFavorite = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/favorites/${id}`);
      setFavorites(prev => prev.filter(f => f.id !== id));
    } catch {
      alert("Failed to remove track.");
    }
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const handlePlay = async (track: FavoriteTrack, action: 'play' | 'queue') => {
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
          source: track.source || 'unknown',
        },
        action,
      });
      setFeedbackId(`${track.id}-${action}`);
      setTimeout(() => setFeedbackId(null), 2000);
    } catch {
      alert("Failed to play track.");
    }
  };

  return (
    <div className="absolute top-6 bottom-6 left-6 right-6 flex justify-center pointer-events-none animate-fade-in">
      <div className="w-full max-w-[1800px] h-full pointer-events-auto overflow-hidden rounded-[28px] bg-black text-white shadow-2xl ring-1 ring-white/10 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(180,83,9,0.25),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(161,98,7,0.15),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#050505_42%,_#000_100%)]" />

        <div className="relative z-10 flex flex-1 min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <section className="min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-[#121212]/90 flex flex-col">
              
              {/* Top Gradient Banner */}
              <div className="relative overflow-hidden rounded-t-[22px] shrink-0 bg-gradient-to-br from-[#78350f] via-[#451a03] to-[#111111] p-4 md:p-6 lg:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,_rgba(251,191,36,0.15),_transparent_30%)]" />
                
                <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                      <Icon name="star" className="w-4 h-4 text-amber-400" /> Your Favorites
                    </p>
                    <h1 className="mt-1 text-4xl font-black tracking-tight text-white md:text-5xl">
                      Liked Songs
                    </h1>
                    <p className="mt-3 max-w-xl text-sm text-zinc-300">
                      {favorites.length} {favorites.length === 1 ? 'track' : 'tracks'} saved to your personal favorites.
                    </p>
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="p-4 md:p-6 lg:p-8 flex-1 min-h-0">
                <div className="space-y-2">
                  {favorites.length > 0 ? (
                    favorites.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group">
                        <span className="w-6 text-center text-sm font-medium text-zinc-500 group-hover:text-white">{i + 1}</span>
                        <div className="w-12 h-12 rounded bg-zinc-800 shrink-0 overflow-hidden relative flex items-center justify-center text-amber-500/50">
                          {t.artwork_url ? (
                            <Image unoptimized src={t.artwork_url} alt="" fill className="object-cover" sizes="48px" />
                          ) : (
                            <Icon name="music" className="h-5 w-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm font-bold text-white truncate group-hover:text-amber-400 transition">{t.track_title}</p>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{t.track_author || 'Unknown Artist'}</p>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handlePlay(t, 'play')} className="p-2 rounded-full hover:bg-amber-500 hover:text-amber-950 text-zinc-300 transition" title="Play Now">
                            {feedbackId === `${t.id}-play` ? <Icon name="check-circle" className="w-4 h-4" /> : <Icon name="play" className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handlePlay(t, 'queue')} className="p-2 rounded-full hover:bg-white/10 text-zinc-300 transition" title="Add to Queue">
                            {feedbackId === `${t.id}-queue` ? <Icon name="check-circle" className="w-4 h-4 text-amber-400" /> : <Icon name="plus" className="w-4 h-4" />}
                          </button>
                          <button onClick={(e) => removeFavorite(t.id, e)} className="p-2 rounded-full hover:bg-red-500/20 hover:text-red-400 text-zinc-500 transition" title="Remove from Favorites">
                            <Icon name="x" className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="text-xs text-zinc-500 font-medium tabular-nums w-12 text-right">
                          {t.duration_ms ? formatDuration(t.duration_ms) : '--:--'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-white/10 bg-white/5 h-full min-h-[300px]">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-amber-500/50">
                        <Icon name="star" className="h-8 w-8" />
                      </div>
                      <h2 className="text-xl font-semibold text-zinc-300">No Favorites</h2>
                      <p className="text-zinc-500 mt-2">Add songs to your favorites while listening.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
