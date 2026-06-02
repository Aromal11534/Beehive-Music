'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { api } from '@/lib/api';
import type { PlayerState, PlaylistSummary, PlayerTrack } from '@/lib/types';
import { Icon } from '@/components/icons';
import { useGuilds } from '@/context/GuildContext';

const CONFIGURED_WS_URL = process.env.NEXT_PUBLIC_WS_URL || '/api/v1';

function normalizeWsBase(base: string) {
  const trimmed = base.replace(/\/$/, '');
  return trimmed.endsWith('/ws') ? trimmed.replace(/\/ws$/, '/api/v1') : trimmed;
}

function getWsBase() {
  if (typeof window === 'undefined') return normalizeWsBase(CONFIGURED_WS_URL);

  const configuredHost = CONFIGURED_WS_URL.startsWith('ws') ? new URL(CONFIGURED_WS_URL).hostname : window.location.hostname;
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || configuredHost !== window.location.hostname) {
    return window.location.port === '3000'
      ? `ws://${window.location.hostname}:8001/api/v1`
      : `${wsProtocol}://${window.location.host}/api/v1`;
  }

  return normalizeWsBase(CONFIGURED_WS_URL);
}

function getTrackTitle(track: PlayerTrack | null | undefined) {
  return track?.title || track?.track_title || 'Unknown Track';
}

function getTrackAuthor(track: PlayerTrack | null | undefined) {
  return track?.author || track?.track_author || 'Unknown Artist';
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function NowPlayingPage() {
  const [state, setState] = useState<PlayerState | null>(null);
  const { guilds, selectedGuild } = useGuilds();
  const [localPosition, setLocalPosition] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const positionRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string>('');
  const [greeting] = useState(getGreeting);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {

    api.get<PlaylistSummary[]>('/playlists').then((data) => {
      setPlaylists(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const tick = () => {
      if (state?.is_playing && !state?.is_paused && !isDraggingRef.current) {
        const elapsed = performance.now() - lastUpdateRef.current;
        const interpolated = positionRef.current + elapsed;
        const duration = state?.current_track?.duration_ms || state?.current_track?.duration || 0;
        setLocalPosition(Math.min(interpolated, duration));
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [state?.is_playing, state?.is_paused, state?.current_track]);

  useEffect(() => {
    if (!selectedGuild) return;

    api.get<PlayerState>(`/player/${selectedGuild}`).then((data) => {
      setState(data);
      positionRef.current = data?.position_ms || 0;
      lastUpdateRef.current = performance.now();
      setLocalPosition(data?.position_ms || 0);
    }).catch(() => setState(null));

    const wsUrl = getWsBase();
    const wsToken = localStorage.getItem('beehive_access_token') || '';
    const ws = new WebSocket(`${wsUrl}/player/ws/${selectedGuild}?token=${encodeURIComponent(wsToken)}`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PlayerState;
        setState(data);
        positionRef.current = data.position_ms || 0;
        lastUpdateRef.current = performance.now();
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => {};
    wsRef.current = ws;

    return () => { ws.close(); };
  }, [selectedGuild]);

  const sendCommand = useCallback((action: string, value?: string | number | boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, value }));
    }
  }, []);

  const commitSeek = useCallback((value: number) => {
    isDraggingRef.current = false;
    positionRef.current = value;
    lastUpdateRef.current = performance.now();
    setLocalPosition(value);
    sendCommand('seek', value);
  }, [sendCommand]);

  const handleVolumeChange = useCallback((vol: number) => {
    setState((prev) => prev ? { ...prev, volume: vol } : prev);
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => {
      sendCommand('volume', vol);
    }, 150);
  }, [sendCommand]);

  const track = state?.current_track;
  const currentTitle = getTrackTitle(track);
  const currentAuthor = getTrackAuthor(track);
  const duration = track?.duration_ms || track?.duration || 0;
  const progress = duration ? Math.min((localPosition / duration) * 100, 100) : 0;
  const queue = state?.queue ?? [];
  const featuredTracks = track ? [track, ...queue].slice(0, 6) : queue.slice(0, 6);
  const selectedGuildName = guilds.find((g) => g.guild?.discord_guild_id === selectedGuild)?.guild?.name || 'Select Server';

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const handleAddFavorite = async () => {
    if (!track) return;
    try {
      await api.post('/favorites', {
        track_title: currentTitle,
        track_author: currentAuthor,
        track_url: track.url || track.identifier,
        track_identifier: track.identifier,
        duration_ms: track.duration_ms || track.duration || 0,
        source: track.source || 'unknown',
        artwork_url: track.artwork_url,
      });
      setActionFeedback('Added to Favorites');
      setTimeout(() => setActionFeedback(''), 2000);
    } catch {
      alert('Failed to add to favorites');
    }
  };

  const handleAddPlaylist = async (playlistId: number) => {
    if (!track) return;
    try {
      await api.post(`/playlists/${playlistId}/tracks`, {
        track_title: currentTitle || 'Unknown Title',
        track_author: currentAuthor || 'Unknown Artist',
        track_url: track.url || track.identifier || 'unknown-url',
        track_identifier: track.identifier || 'unknown-id',
        duration_ms: track.duration_ms || track.duration || 0,
        source: track.source || 'unknown',
        artwork_url: track.artwork_url || '',
      });
      setShowPlaylistMenu(false);
      setActionFeedback('Added to Playlist');
      setTimeout(() => setActionFeedback(''), 2000);
    } catch {
      alert('Failed to add to playlist');
    }
  };

  return (
    <div className="absolute top-6 bottom-6 left-6 right-6 flex justify-center pointer-events-none">
      <div className="w-full max-w-[1800px] h-full pointer-events-auto overflow-hidden rounded-[28px] bg-black text-white shadow-2xl ring-1 ring-white/10 flex flex-col relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(88,28,135,0.55),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(30,64,175,0.2),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#050505_42%,_#000_100%)]" />

        <div className="relative z-10 flex flex-1 min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
          <section className="min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-[#121212]/90">
            <div className="relative overflow-hidden rounded-t-[22px] bg-gradient-to-br from-[#2d155f] via-[#211345] to-[#111111] p-4 md:p-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,_rgba(132,90,223,0.3),_transparent_30%)]" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  <button className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-zinc-200 backdrop-blur transition hover:bg-black/55" aria-label="Previous page">
                    <Icon name="arrow-left" className="h-4 w-4" />
                  </button>
                  <button className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-zinc-200 backdrop-blur transition hover:bg-black/55" aria-label="Next page">
                    <Icon name="arrow-right" className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="relative mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
                <div>
                  <p className="text-sm font-semibold text-zinc-300">{selectedGuildName}</p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">{greeting}</h1>
                  <p className="mt-3 max-w-xl text-sm text-zinc-300">A private music room for this server, with live queue control and a focused player view.</p>
                </div>

                <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/10 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                      {track?.artwork_url ? (
                        <Image unoptimized src={track.artwork_url} alt={currentTitle} fill className="object-cover" sizes="64px" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-amber-300"><Icon name="music" className="h-7 w-7" /></div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Now Playing</p>
                      <p className="truncate text-sm font-bold text-white">{track ? currentTitle : 'Nothing playing'}</p>
                      <p className="truncate text-xs text-zinc-400">{track ? currentAuthor : 'Start playback from Discord or Search'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-7 p-4 md:p-6">
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-black tracking-tight">Live queue</h2>
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">{queue.length} upcoming</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(featuredTracks.length ? featuredTracks : [null, null, null]).map((item, index) => (
                    <div key={`${getTrackTitle(item)}-${index}`} className="group flex items-center gap-3 rounded-lg bg-white/10 p-2 transition hover:bg-white/18">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800">
                        {item?.artwork_url ? (
                          <Image unoptimized src={item.artwork_url} alt={getTrackTitle(item)} fill className="object-cover" sizes="48px" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-zinc-500"><Icon name="music" className="h-5 w-5" /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{item ? getTrackTitle(item) : 'Queue slot'}</p>
                        <p className="truncate text-xs text-zinc-400">{item ? getTrackAuthor(item) : 'Waiting for tracks'}</p>
                      </div>
                      {index === 0 && track ? <span className="mr-2 h-4 w-1 rounded bg-emerald-400" /> : null}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-black tracking-tight">Made for this session</h2>
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Show all</span>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                  {featuredTracks.slice(0, 5).map((item, index) => (
                    <div key={`${getTrackTitle(item)}-mix-${index}`} className="rounded-lg bg-[#181818] p-3 transition hover:bg-[#242424]">
                      <div className="relative aspect-square overflow-hidden rounded-md bg-zinc-800 shadow-lg">
                        {item.artwork_url ? (
                          <Image unoptimized src={item.artwork_url} alt={getTrackTitle(item)} fill className="object-cover" sizes="180px" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-amber-300"><Icon name="disc" className="h-8 w-8" /></div>
                        )}
                      </div>
                      <p className="mt-3 truncate text-sm font-bold text-white">{index === 0 ? 'Current Mix' : `Daily Mix ${index}`}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{getTrackTitle(item)} by {getTrackAuthor(item)}</p>
                    </div>
                  ))}
                  {!featuredTracks.length && [1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="rounded-lg bg-[#181818] p-3">
                      <div className="aspect-square rounded-md bg-zinc-800/80" />
                      <div className="mt-3 h-3 rounded bg-zinc-700" />
                      <div className="mt-2 h-3 w-2/3 rounded bg-zinc-800" />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>

          <aside className="hidden min-h-0 w-[320px] shrink-0 overflow-y-auto rounded-[22px] bg-[#181818] p-4 ring-1 ring-white/5 lg:block">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black">{track ? 'Now Playing' : 'Player'}</h2>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-300">Live</span>
            </div>

            <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-900 shadow-2xl">
              {track?.artwork_url ? (
                <Image unoptimized src={track.artwork_url} alt={currentTitle} fill className="object-cover" sizes="320px" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-900/60 to-zinc-900 text-amber-300"><Icon name="music" className="h-20 w-20" /></div>
              )}
            </div>

            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-xl font-black">{track ? currentTitle : 'Nothing Playing'}</h3>
                <p className="mt-1 truncate text-sm text-zinc-400">{track ? currentAuthor : 'Choose a track from Search'}</p>
              </div>
              <button onClick={handleAddFavorite} className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-emerald-400" title="Add to Favorites">
                <Icon name="star" className="h-5 w-5" />
              </button>
            </div>

            <div className="relative mt-6 overflow-hidden rounded-xl bg-[#242424]">
              <div className="relative h-32 bg-zinc-900">
                {track?.artwork_url ? (
                  <Image unoptimized src={track.artwork_url} alt={currentAuthor} fill className="object-cover opacity-70 blur-[1px]" sizes="320px" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-[#242424] to-transparent" />
              </div>
              <div className="p-4">
                <p className="text-sm font-black">About the artist</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{currentAuthor}</p>
                    <p className="text-xs text-zinc-400">Live from {selectedGuildName}</p>
                  </div>
                  <button className="rounded-full border border-white/40 px-3 py-1 text-xs font-bold transition hover:scale-105 hover:border-white">Follow</button>
                </div>
                <p className="mt-3 line-clamp-4 text-xs leading-5 text-zinc-300">Playback is synced from your Discord server through Beehive. Manage the queue, save favorites, and jump through the track without leaving this room.</p>
              </div>
            </div>

            <div className="relative mt-4">
              <button onClick={() => setShowPlaylistMenu(!showPlaylistMenu)} className="w-full rounded-full bg-white px-4 py-2 text-sm font-black text-zinc-950 transition hover:scale-[1.02] hover:bg-zinc-200">
                Add to Playlist
              </button>
            </div>
          </aside>
        </div>

        {/* Modal goes outside the sidebar but inside the main container to overlay properly */}
        {showPlaylistMenu && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowPlaylistMenu(false) }}>
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(245,158,11,0.15),_transparent_80%)] pointer-events-none" />
              
              <div className="relative p-6 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-white">Add to Playlist</h3>
                  <p className="text-sm text-zinc-400 mt-1">Select a destination for &quot;{currentTitle}&quot;</p>
                </div>
                <button onClick={() => setShowPlaylistMenu(false)} className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition">
                  <Icon name="x" className="w-5 h-5" />
                </button>
              </div>
              
              <div className="relative p-2 max-h-[350px] overflow-y-auto">
                {playlists.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                      <Icon name="disc" className="w-6 h-6 text-zinc-500" />
                    </div>
                    <p className="text-zinc-300 font-bold">No playlists found</p>
                    <p className="text-xs text-zinc-500 mt-1">Create one in the Playlists tab</p>
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {playlists.map((playlist) => (
                      <button 
                        key={playlist.id} 
                        onClick={() => handleAddPlaylist(playlist.id)} 
                        className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group text-left"
                      >
                        <div className="w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center group-hover:bg-amber-500/20 group-hover:text-amber-400 text-zinc-500 transition shadow-inner">
                          <Icon name="disc" className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-zinc-200 group-hover:text-white transition truncate">{playlist.name}</p>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mt-0.5">{playlist.track_count || 0} tracks</p>
                        </div>
                        <Icon name="plus" className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <footer className="relative z-20 shrink-0 border-t border-white/10 bg-black/95 px-4 py-3 backdrop-blur-xl">
          {actionFeedback && (
            <div className="absolute -top-12 right-5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300 shadow-xl">
              {actionFeedback}
            </div>
          )}

          <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,280px)_minmax(320px,1fr)_minmax(0,280px)]">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-zinc-800">
                {track?.artwork_url ? (
                  <Image unoptimized src={track.artwork_url} alt={currentTitle} fill className="object-cover" sizes="56px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-500"><Icon name="music" className="h-5 w-5" /></div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{track ? currentTitle : 'Nothing playing'}</p>
                <p className="truncate text-xs text-zinc-400">{track ? currentAuthor : selectedGuildName}</p>
              </div>
            </div>

            <div className="mx-auto w-full max-w-2xl">
              <div className="mb-2 flex items-center justify-center gap-5">
                <button onClick={() => sendCommand('shuffle')} title="Shuffle" className="text-zinc-400 transition hover:text-white">
                  <Icon name="sliders" className="h-4 w-4" />
                </button>
                <button onClick={() => sendCommand('previous')} title="Previous" className="text-zinc-300 transition hover:text-white">
                  <Icon name="skip-back" className="h-5 w-5" />
                </button>
                <button
                  onClick={() => sendCommand(state?.is_playing ? 'pause' : 'resume')}
                  title={state?.is_playing ? 'Pause' : 'Resume'}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:scale-105"
                >
                  <Icon name={state?.is_playing ? 'pause' : 'play'} className="h-5 w-5" />
                </button>
                <button onClick={() => sendCommand('skip')} title="Skip" className="text-zinc-300 transition hover:text-white">
                  <Icon name="skip-forward" className="h-5 w-5" />
                </button>
                <button onClick={() => sendCommand('loop', state?.loop_mode === 'queue' ? 'off' : 'queue')} title="Loop" className={state?.loop_mode !== 'off' ? 'text-emerald-400' : 'text-zinc-400 transition hover:text-white'}>
                  <Icon name="repeat" className="h-4 w-4" />
                </button>
                <button onClick={() => setShowPlaylistMenu(true)} title="Add to Playlist" className="text-zinc-400 transition hover:text-white hover:scale-110 ml-2">
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-[42px_minmax(0,1fr)_42px] items-center gap-2 text-[11px] text-zinc-400">
                <span className="text-right tabular-nums">{formatTime(localPosition)}</span>
                <div className="relative flex h-5 items-center">
                  <div className="pointer-events-none absolute left-0 right-0 h-1 overflow-hidden rounded-full bg-zinc-700">
                    <div className="h-full origin-left rounded-full bg-white transition-transform duration-100 ease-linear" style={{ transform: `scaleX(${progress / 100})` }} />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="100"
                    value={localPosition}
                    onMouseDown={() => { isDraggingRef.current = true; }}
                    onTouchStart={() => { isDraggingRef.current = true; }}
                    onChange={(e) => setLocalPosition(parseInt(e.target.value))}
                    onMouseUp={(e) => commitSeek(parseInt(e.currentTarget.value))}
                    onTouchEnd={(e) => commitSeek(parseInt(e.currentTarget.value))}
                    className="spotify-seeker absolute inset-0 h-5 w-full cursor-pointer appearance-none bg-transparent focus:outline-none"
                  />
                </div>
                <span className="tabular-nums">{formatTime(duration)}</span>
              </div>
            </div>

            <div className="hidden items-center justify-end gap-3 lg:flex">
              <Icon name="volume" className="h-4 w-4 text-zinc-400" />
              <input
                type="range"
                min="0"
                max="200"
                value={state?.volume ?? 80}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                style={{ backgroundSize: `${Math.min(((state?.volume ?? 80) / 200) * 100, 100)}% 4px, 100% 4px` }}
                className="spotify-volume h-4 w-28 cursor-pointer appearance-none bg-transparent"
              />
              <span className="w-9 text-right text-xs font-bold text-zinc-400">{state?.volume ?? 80}%</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
    </div>
  );
}
