'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { PlaylistSummary, PlaylistDetail, PlaylistTrack } from '@/lib/types';
import { Icon } from '@/components/icons';
import { useGuilds } from '@/context/GuildContext';
import { FallbackImage } from '@/components/FallbackImage';
import { usePlayer } from '@/context/PlayerContext';

function PlaylistsContent() {
  const [personalPlaylists, setPersonalPlaylists] = useState<PlaylistSummary[]>([]);
  const [serverPlaylists, setServerPlaylists] = useState<PlaylistSummary[]>([]);
  const [activeTab, setActiveTab] = useState<'personal' | 'server'>('personal');
  const [showCreate, setShowCreate] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [showMainDropdown, setShowMainDropdown] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { guilds, selectedGuild } = useGuilds();
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialId = searchParams.get('id');
  const initialName = searchParams.get('name');
  
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistDetail | null>(
    initialId && initialName ? {
      id: Number(initialId),
      name: initialName,
      playlist_type: 'server',
      tracks: []
    } as unknown as PlaylistDetail : null
  );

  const loadPlaylists = async () => {
    try {
      const p = await api.get<PlaylistSummary[]>('/playlists');
      setPersonalPlaylists(p);
    } catch {}

    if (selectedGuild) {
      const g = guilds.find(g => g.guild?.discord_guild_id === selectedGuild);
      if (g && g.guild_id) {
        try {
          const s = await api.get<PlaylistSummary[]>(`/guilds/${g.guild_id}/playlists`);
          setServerPlaylists(s);
        } catch {}
      } else {
        setServerPlaylists([]);
      }
    } else {
      setServerPlaylists([]);
    }
  };

  useEffect(() => {
    loadPlaylists();
  }, [selectedGuild, guilds]);

  const createPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const payload: any = { name: newName, playlist_type: activeTab };

    if (activeTab === 'server') {
      const g = guilds.find(g => g.guild?.discord_guild_id === selectedGuild);
      if (!g || !g.guild_id) {
        alert("Cannot create server playlist: no server selected.");
        return;
      }
      payload.owner_guild_id = g.guild_id;
    }

    try {
      await api.post('/playlists', payload);
      setNewName('');
      setShowCreate(false);
      loadPlaylists();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to create playlist. You might not have DJ/Admin permissions.");
    }
  };

  const importPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImporting(true);
    
    try {
      let p;
      if (selectedPlaylist && typeof selectedPlaylist.id === 'number') {
        p = await api.post<PlaylistDetail>(`/playlists/${selectedPlaylist.id}/import`, { url: importUrl });
      } else {
        const payload: any = { url: importUrl, playlist_type: activeTab };
        if (activeTab === 'server') {
          const g = guilds.find(g => g.guild?.discord_guild_id === selectedGuild);
          if (!g || !g.guild_id) {
            alert("Cannot import server playlist: no server selected.");
            setImporting(false);
            return;
          }
          payload.owner_guild_id = g.guild_id;
        }
        p = await api.post<PlaylistDetail>('/playlists/import', payload);
      }
      
      setImportUrl('');
      setShowImportModal(false);
      loadPlaylists();
      loadPlaylist(p.id);
      
      if (!selectedPlaylist) {
        router.push(`/playlists?id=${p.id}&name=${encodeURIComponent(p.name)}`);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to import playlist.");
    } finally {
      setImporting(false);
    }
  };

  const loadPlaylist = async (id: number) => {
    try {
      const data = await api.get<PlaylistDetail>(`/playlists/${id}`);
      setSelectedPlaylist(data);
    } catch {
      setSelectedPlaylist(null);
    }
  };

  const initialType = searchParams.get('type');
  const { state } = usePlayer();
  const track = state?.current_track;
  const queue = state?.queue || [];

  useEffect(() => {
    if (initialType === 'dynamic' && initialId && initialName) {
      const featuredTracks = track ? [track, ...queue].slice(0, 6) : queue.slice(0, 6);
      let tracksData: any[] = [];
      
      if (initialId === 'daily-mix') {
        tracksData = featuredTracks;
      } else if (initialId === 'quick-picks') {
        tracksData = queue.slice(0, 8).reverse();
      } else if (initialId === 'listen-again') {
        tracksData = queue.slice(2, 10);
      }

      setSelectedPlaylist({
        id: initialId as any,
        name: initialName,
        playlist_type: 'server',
        track_count: tracksData.filter(Boolean).length,
        tracks: tracksData.filter(Boolean).map((t, i) => ({
          id: i,
          playlist_id: initialId as any,
          track_title: t.track_title || 'Unknown Track',
          track_author: t.track_author || 'Unknown Artist',
          track_url: t.track_url || '',
          track_identifier: t.track_identifier || t.track_url || '',
          source: t.source || (t.track_url?.includes('spotify') ? 'spotify' : 'youtube'),
          duration_ms: t.duration_ms || 0,
          artwork_url: t.artwork_url || '',
          position: i,
          added_at: new Date().toISOString()
        }))
      });
    } else if (initialId) {
      loadPlaylist(Number(initialId));
    } else {
      setSelectedPlaylist(null);
    }
  }, [initialId, initialName, initialType, track, queue]);

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

  const handlePlayPlaylist = async (actionType: 'play' | 'queue') => {
    if (!selectedGuild) return alert("Please select a server at the top right.");
    if (!selectedPlaylist || !selectedPlaylist.tracks || selectedPlaylist.tracks.length === 0) {
      return alert("This playlist is empty.");
    }
    
    let tracksToSend = [...selectedPlaylist.tracks];
    
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
      source: 'unknown',
    }));
    
    try {
      await api.post('/player/play', {
        guild_id: selectedGuild,
        tracks: mappedTracks,
        action: actionType,
      });
    } catch {
      alert("Failed to play playlist.");
    }
  };

  const executeDeletePlaylist = async () => {
    if (!selectedPlaylist) return;
    
    try {
      await api.delete(`/playlists/${selectedPlaylist.id}`);
      setSelectedPlaylist(null);
      setShowDeleteModal(false);
      loadPlaylists();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to delete playlist.");
    }
  };

  const displayedPlaylists = activeTab === 'personal' ? personalPlaylists : serverPlaylists;

  return (
    <div className="absolute top-6 bottom-6 left-6 right-6 flex justify-center pointer-events-none animate-fade-in">
      <div className="w-full max-w-[1800px] h-full pointer-events-auto overflow-hidden rounded-[28px] bg-black text-white shadow-2xl ring-1 ring-white/10 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(4,120,87,0.25),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(3,105,161,0.15),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#050505_42%,_#000_100%)]" />

        <div className="relative z-10 flex flex-1 min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <section className="min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-[#121212]/90 flex flex-col relative">
              
              {/* Top Gradient Banner */}
              <div className="relative rounded-t-[22px] shrink-0 bg-gradient-to-br from-[#064e3b] via-[#022c22] to-[#111111] p-4 md:p-6 lg:p-8 z-10">
                <div className="absolute inset-0 overflow-hidden rounded-t-[22px] pointer-events-none">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,_rgba(16,185,129,0.15),_transparent_30%)]" />
                </div>
                
                <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    {selectedPlaylist ? (
                      <button onClick={() => { 
                        setSelectedPlaylist(null); 
                        if (initialType === 'dynamic') {
                          router.push('/dashboard');
                        } else {
                          router.push('/playlists'); 
                        }
                      }} className="mb-2 text-emerald-400 hover:text-emerald-300 flex items-center gap-2 text-sm font-semibold transition">
                        <Icon name="arrow-left" className="w-4 h-4" /> 
                        {initialType === 'dynamic' ? 'Back to Now Playing' : 'Back to Playlists'}
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
                    <div className="flex items-center gap-2 shrink-0 mt-4 md:mt-0 pb-2">
                      <button
                        onClick={() => setShowCreate(true)}
                        className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-emerald-950 font-semibold rounded-xl text-sm hover:from-emerald-400 hover:to-emerald-500 transition shadow-lg shrink-0"
                      >
                        + Create Playlist
                      </button>
                      <div className="relative">
                        <button 
                          onClick={() => setShowMainDropdown(!showMainDropdown)}
                          className="p-2 text-zinc-400 hover:text-white transition-colors"
                          title="More options"
                        >
                          <Icon name="more-horizontal" className="w-7 h-7" />
                        </button>
                        
                        {showMainDropdown && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowMainDropdown(false)} />
                            <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.15),_transparent_80%)] pointer-events-none" />
                              <div className="relative p-1">
                                <button 
                                  onClick={() => { setShowImportModal(true); setShowMainDropdown(false); }}
                                  className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-white/5 rounded-xl flex items-center gap-3 transition-colors font-semibold"
                                >
                                  <Icon name="plus" className="w-4 h-4 text-emerald-400" />
                                  Import Playlist
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedPlaylist && (
                    <div className="flex items-center gap-6 shrink-0 mt-4 md:mt-0 pb-2">
                      <button 
                        onClick={() => handlePlayPlaylist('play')} 
                        className="w-14 h-14 bg-emerald-500 text-black rounded-full flex items-center justify-center hover:scale-105 hover:bg-emerald-400 transition-transform shadow-xl shrink-0"
                        title="Play"
                      >
                        <Icon name="play" className="w-6 h-6 fill-black ml-1" />
                      </button>
                      <button 
                        onClick={() => setShuffleEnabled(!shuffleEnabled)} 
                        className={`p-2 transition-all shrink-0 ${shuffleEnabled ? 'text-emerald-500 hover:text-emerald-400 hover:scale-105' : 'text-zinc-500 hover:text-zinc-400 hover:scale-105'}`}
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
                            <div className="absolute top-full left-0 md:left-auto md:right-0 mt-2 w-56 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.15),_transparent_80%)] pointer-events-none" />
                              <div className="relative p-1">
                                <button 
                                  onClick={() => { handlePlayPlaylist('queue'); setShowDropdown(false); }}
                                  className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-white/5 rounded-xl flex items-center gap-3 transition-colors font-semibold"
                                >
                                  <Icon name="list-plus" className="w-4 h-4 text-emerald-400" />
                                  Add to queue
                                </button>
                                <button 
                                  onClick={() => { setShowImportModal(true); setShowDropdown(false); }}
                                  className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-white/5 rounded-xl flex items-center gap-3 transition-colors font-semibold"
                                >
                                  <Icon name="plus" className="w-4 h-4 text-emerald-400" />
                                  Import Tracks
                                </button>
                                <div className="h-px bg-white/5 my-1 mx-2" />
                                <button 
                                  onClick={() => { setShowDeleteModal(true); setShowDropdown(false); }}
                                  className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-xl flex items-center gap-3 transition-colors font-semibold"
                                >
                                  <Icon name="trash" className="w-4 h-4 text-red-400" />
                                  Delete
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
              <div className="p-4 md:p-6 lg:p-8 flex-1 min-h-0 flex flex-col">
                {!selectedPlaylist && (
                  <div className="relative flex items-center bg-black/60 p-1 rounded-full w-fit mb-6 ring-1 ring-white/10 shadow-inner">
                    <div 
                      className={`absolute inset-y-1 w-[120px] bg-emerald-500 rounded-full transition-all duration-300 ease-out shadow-lg ${activeTab === 'server' ? 'translate-x-[120px]' : 'translate-x-0'}`}
                    />
                    <button
                      onClick={() => setActiveTab('personal')}
                      className={`relative z-10 w-[120px] py-2.5 rounded-full text-sm font-bold transition-colors duration-300 ${activeTab === 'personal' ? 'text-emerald-950' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Personal
                    </button>
                    <button
                      onClick={() => setActiveTab('server')}
                      className={`relative z-10 w-[120px] py-2.5 rounded-full text-sm font-bold transition-colors duration-300 ${activeTab === 'server' ? 'text-emerald-950' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Server
                    </button>
                  </div>
                )}

                {selectedPlaylist ? (
                  <div className="space-y-2 overflow-y-auto min-h-0">
                    {selectedPlaylist.tracks?.length > 0 ? (
                      selectedPlaylist.tracks.map((t, i) => (
                        <div key={t.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group">
                          <span className="w-6 text-center text-sm font-medium text-zinc-500 group-hover:text-white">{i + 1}</span>
                          <div className="w-12 h-12 rounded bg-zinc-800 shrink-0 overflow-hidden relative">
                            <FallbackImage src={t.artwork_url} className="object-cover" sizes="48px" />
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400 transition">{t.track_title}</p>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">{t.track_author || 'Unknown Artist'}</p>
                          </div>
                          
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handlePlay(t, 'play')} className="p-2 rounded-full hover:bg-emerald-500 hover:text-emerald-950 text-zinc-300 transition" title="Play Now">
                              {feedbackId === `${t.id}-play` ? <Icon name="check-circle" className="w-4 h-4" /> : <Icon name="play" className="w-4 h-4" />}
                            </button>
                            <button onClick={() => handlePlay(t, 'queue')} className="p-2 rounded-full hover:bg-white/10 text-zinc-300 transition" title="Add to Queue">
                              {feedbackId === `${t.id}-queue` ? <Icon name="check-circle" className="w-4 h-4 text-emerald-400" /> : <Icon name="list-plus" className="w-4 h-4" />}
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
                    {displayedPlaylists.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto min-h-0">
                        {displayedPlaylists.map((p) => (
                          <div key={p.id} onClick={() => {
                            setSelectedPlaylist({ id: p.id, name: p.name, playlist_type: p.playlist_type, tracks: [] } as unknown as PlaylistDetail);
                            loadPlaylist(p.id);
                          }} className="group rounded-2xl bg-white/5 p-5 ring-1 ring-white/5 transition hover:bg-white/10 hover:ring-emerald-500/30 cursor-pointer">
                            <div className="w-14 h-14 rounded-xl bg-black/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform text-emerald-400 overflow-hidden relative shadow-inner shrink-0">
                              {p.top_artworks && p.top_artworks.length > 0 ? (
                                <div className={`w-full h-full ${p.top_artworks.length === 1 ? 'block' : 'grid grid-cols-2 grid-rows-2'}`}>
                                  {p.top_artworks.length === 1 ? (
                                    <div className="relative w-full h-full">
                                      <FallbackImage src={p.top_artworks[0]} className="object-cover" sizes="56px" />
                                    </div>
                                  ) : (
                                    Array.from({ length: 4 }).map((_, i) => {
                                      const artwork = p.top_artworks![i] || p.top_artworks![i % p.top_artworks!.length];
                                      return artwork ? (
                                        <div key={i} className="relative w-full h-full">
                                          <FallbackImage src={artwork} className="object-cover" sizes="28px" />
                                        </div>
                                      ) : (
                                        <div key={i} className="bg-zinc-800 w-full h-full" />
                                      );
                                    })
                                  )}
                                </div>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-black/40 group-hover:bg-emerald-500/20 transition-colors">
                                  <Icon name="disc" className="h-7 w-7" />
                                </div>
                              )}
                            </div>
                            <h3 className="font-semibold text-lg text-white truncate">{p.name}</h3>
                            <p className="text-sm font-medium text-zinc-400 mt-1 uppercase tracking-wider text-xs">
                              {p.track_count || 0} tracks • {p.playlist_type}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-white/10 bg-white/5 flex-1 min-h-[300px]">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-emerald-500/50">
                          <Icon name="disc" className="h-8 w-8" />
                        </div>
                        <h2 className="text-xl font-black text-white">No {activeTab === 'server' ? 'Server' : 'Personal'} Playlists</h2>
                        <p className="text-sm text-zinc-400 mt-2 max-w-md text-center">
                          {activeTab === 'server' 
                            ? "Create a server playlist to share tracks with everyone in this Discord server."
                            : "Create your first personal playlist to start saving tracks."}
                        </p>
                        <button onClick={() => setShowCreate(true)} className="mt-6 px-5 py-2.5 bg-white/10 hover:bg-white/20 transition rounded-xl text-sm font-semibold">
                          Create Playlist
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              
            </section>
          </div>
        </div>
      </div>
      
      {/* Creation Modal (Moved outside overflow-hidden to fix clipping) */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.15),_transparent_80%)] pointer-events-none" />
            
            <div className="relative p-6 border-b border-white/5 flex justify-between items-start">
              <div className="flex flex-col gap-1 pr-4">
                <h3 className="text-xl font-black text-white">
                  Create {activeTab === 'server' ? 'Server' : 'Personal'} Playlist
                </h3>
                <p className="text-sm text-zinc-400">
                  {activeTab === 'server' 
                    ? "Bound to the selected server. DJs/Admins only." 
                    : "Bound to your account. Only you can view or edit."}
                </p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition shrink-0">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            
            <div className="relative p-6">
              <form onSubmit={createPlaylist} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Playlist Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="E.g., Chill Vibes, Workout Mix..."
                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition font-medium text-lg"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <button type="button" onClick={() => setShowCreate(false)} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition">
                    Cancel
                  </button>
                  <button type="submit" disabled={!newName.trim()} className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20">
                    Create Playlist
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget && !importing) setShowImportModal(false) }}>
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.15),_transparent_80%)] pointer-events-none" />
            
            <div className="relative p-6 border-b border-white/5 flex justify-between items-start">
              <div className="flex flex-col gap-1 pr-4">
                <h3 className="text-xl font-black text-white">
                  {selectedPlaylist ? `Import into ${selectedPlaylist.name}` : 'Import Playlist'}
                </h3>
                <p className="text-sm text-zinc-400">
                  Paste a link from Spotify or YouTube Music.
                </p>
              </div>
              <button disabled={importing} onClick={() => setShowImportModal(false)} className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition shrink-0 disabled:opacity-50">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            
            <div className="relative p-6">
              <form onSubmit={importPlaylist} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Playlist Link</label>
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://open.spotify.com/playlist/..."
                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-2xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition font-medium text-sm"
                    autoFocus
                    disabled={importing}
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <button type="button" disabled={importing} onClick={() => setShowImportModal(false)} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={!importUrl.trim() || importing} className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                    {importing ? (
                      <>
                        <Icon name="loader" className="w-4 h-4 animate-spin" />
                        Importing...
                      </>
                    ) : 'Import Playlist'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false) }}>
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(239,68,68,0.15),_transparent_80%)] pointer-events-none" />
            
            <div className="relative p-6 border-b border-white/5 flex justify-between items-start">
              <div className="flex flex-col gap-1 pr-4">
                <h3 className="text-xl font-black text-white">Delete Playlist</h3>
                <p className="text-sm text-zinc-400">
                  Are you sure you want to delete &quot;{selectedPlaylist?.name}&quot;?
                </p>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition shrink-0">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            
            <div className="relative p-6">
              <p className="text-zinc-300 text-sm mb-6 font-medium">
                This action cannot be undone. All tracks in this playlist will be removed from your collection.
              </p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowDeleteModal(false)} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition">
                  Cancel
                </button>
                <button type="button" onClick={executeDeletePlaylist} className="px-6 py-3 bg-red-500 hover:bg-red-400 text-red-950 rounded-xl text-sm font-bold transition shadow-lg shadow-red-500/20">
                  Delete Playlist
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlaylistsPage() {
  return (
    <Suspense fallback={null}>
      <PlaylistsContent />
    </Suspense>
  );
}
