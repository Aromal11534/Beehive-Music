'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { FavoriteTrack } from '@/lib/types';
import { Icon } from '@/components/icons';
import { useGuilds } from '@/context/GuildContext';
import { FallbackImage } from '@/components/FallbackImage';
import Image from 'next/image';
import { BackgroundWaveform } from '@/components/BackgroundWaveform';
import { usePlayer } from '@/context/PlayerContext';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const { selectedGuild } = useGuilds();
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const { state } = usePlayer();
  const track = state?.current_track;
  const isPlaying = !!(state && state.is_playing && !state.is_paused);

  useEffect(() => {
    loadFavorites();
  }, []);

  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const loadFavorites = () => {
    api.get<FavoriteTrack[]>('/favorites').then(setFavorites).catch(() => {});
  };

  const importFavorites = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImporting(true);
    
    try {
      const response = await api.post<FavoriteTrack[]>('/favorites/import', { url: importUrl });
      setFavorites(response);
      setImportUrl('');
      setShowImportModal(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to import tracks to favorites.");
    } finally {
      setImporting(false);
    }
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

  const handlePlayFavorites = async (actionType: 'play' | 'queue') => {
    if (!selectedGuild) return alert("Please select a server at the top right.");
    if (favorites.length === 0) {
      return alert("Your favorites list is empty.");
    }
    
    let tracksToSend = [...favorites];
    
    if (shuffleEnabled) {
      for (let i = tracksToSend.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracksToSend[i], tracksToSend[j]] = [tracksToSend[j], tracksToSend[i]];
      }
    }
    
    const mappedTracks = tracksToSend.map(t => ({
      title: t.track_title,
      author: t.track_author || 'Unknown Artist',
      url: t.track_url,
      identifier: t.track_url,
      duration: t.duration_ms || 0,
      artwork_url: t.artwork_url,
      source: t.source || 'unknown',
    }));
    
    try {
      await api.post('/player/play', {
        guild_id: selectedGuild,
        tracks: mappedTracks,
        action: actionType,
      });
    } catch {
      alert("Failed to play favorites.");
    }
  };

  return (
    <div className="absolute top-6 bottom-6 left-6 right-6 flex justify-center pointer-events-none animate-fade-in">
      <div className="w-full max-w-[1800px] h-full pointer-events-auto overflow-hidden rounded-[28px] bg-black text-white shadow-2xl ring-1 ring-white/10 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(180,83,9,0.25),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(161,98,7,0.15),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#050505_42%,_#000_100%)]" />

        <div className="relative z-10 flex flex-1 min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <section className="min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-[#121212]/90">
              
              {/* Top Gradient Banner */}
              <div className="relative rounded-t-[22px] shrink-0 bg-gradient-to-br from-[#78350f] via-[#451a03] to-[#111111] p-4 md:p-6 lg:p-8 z-10">
                <div className="absolute inset-0 overflow-hidden rounded-t-[22px] pointer-events-none">
                  <BackgroundWaveform isPlaying={isPlaying} track={track} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,_rgba(251,191,36,0.15),_transparent_30%)]" />
                </div>
                
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
                  {favorites.length > 0 && (
                    <div className="flex items-center gap-6 shrink-0 mt-4 md:mt-0 pb-2">
                      <button 
                        onClick={() => handlePlayFavorites('play')} 
                        className="w-14 h-14 bg-amber-500 text-black rounded-full flex items-center justify-center hover:scale-105 hover:bg-amber-400 transition-transform shadow-xl shrink-0"
                        title="Play"
                      >
                        <Icon name="play" className="w-6 h-6 fill-black ml-1" />
                      </button>
                      <button 
                        onClick={() => setShuffleEnabled(!shuffleEnabled)} 
                        className={`p-2 transition-all shrink-0 ${shuffleEnabled ? 'text-amber-500 hover:text-amber-400 hover:scale-105' : 'text-zinc-500 hover:text-zinc-400 hover:scale-105'}`}
                        title={shuffleEnabled ? 'Disable Shuffle' : 'Enable Shuffle'}
                      >
                        <Icon name="shuffle" className="w-7 h-7" />
                      </button>

                      <div className="relative">
                        <button 
                          onClick={() => setShowDropdown(!showDropdown)}
                          className="p-2 text-zinc-400 hover:text-white transition-colors shrink-0"
                          title="More options"
                        >
                          <Icon name="more-horizontal" className="w-7 h-7" />
                        </button>
                        
                        {showDropdown && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                            <div className="absolute top-full left-0 md:left-auto md:right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.15),_transparent_80%)] pointer-events-none" />
                              <div className="relative p-1">
                                <button 
                                  onClick={() => { handlePlayFavorites('queue'); setShowDropdown(false); }}
                                  className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-white/5 rounded-xl flex items-center gap-3 transition-colors font-semibold"
                                >
                                  <Icon name="list-plus" className="w-4 h-4 text-amber-400" />
                                  Add to queue
                                </button>
                                <button 
                                  onClick={() => { setShowImportModal(true); setShowDropdown(false); }}
                                  className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-white/5 rounded-xl flex items-center gap-3 transition-colors font-semibold"
                                >
                                  <Icon name="plus" className="w-4 h-4 text-amber-400" />
                                  Import Tracks
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Main Content Area */}
              <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-32 lg:pb-32">
                <div className="space-y-2">
                  {favorites.length > 0 ? (
                    favorites.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group">
                        <span className="w-6 text-center text-sm font-medium text-zinc-500 group-hover:text-white">{i + 1}</span>
                          <div className="w-12 h-12 rounded bg-zinc-800 shrink-0 overflow-hidden relative">
                            <FallbackImage src={t.artwork_url} className="object-cover" sizes="48px" />
                          </div>
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-amber-400 transition">{t.track_title}</p>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{t.track_author || 'Unknown Artist'}</p>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handlePlay(t, 'play')} className="p-2 rounded-full hover:bg-amber-500 hover:text-amber-950 text-zinc-300 transition" title="Play Now">
                            {feedbackId === `${t.id}-play` ? <Icon name="check-circle" className="w-4 h-4" /> : <Icon name="play" className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handlePlay(t, 'queue')} className="p-2 rounded-full hover:bg-white/10 text-zinc-300 transition" title="Add to Queue">
                            {feedbackId === `${t.id}-queue` ? <Icon name="check-circle" className="w-4 h-4 text-amber-400" /> : <Icon name="list-plus" className="w-4 h-4" />}
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

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget && !importing) setShowImportModal(false) }}>
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.15),_transparent_80%)] pointer-events-none" />
            
            <div className="relative p-6 border-b border-white/5 flex justify-between items-start">
              <div className="flex flex-col gap-1 pr-4">
                <h3 className="text-xl font-black text-white">Import to Favorites</h3>
                <p className="text-sm text-zinc-400">
                  Paste a link from Spotify or YouTube Music.
                </p>
              </div>
              <button disabled={importing} onClick={() => setShowImportModal(false)} className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition shrink-0 disabled:opacity-50">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            
            <div className="relative p-6">
              <form onSubmit={importFavorites} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Playlist Link</label>
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://open.spotify.com/playlist/..."
                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition font-medium text-sm"
                    autoFocus
                    disabled={importing}
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <button type="button" disabled={importing} onClick={() => setShowImportModal(false)} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={!importUrl.trim() || importing} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-amber-950 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition shadow-lg shadow-amber-500/20 flex items-center gap-2">
                    {importing ? (
                      <>
                        <Icon name="loader" className="w-4 h-4 animate-spin" />
                        Importing...
                      </>
                    ) : 'Import Tracks'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
