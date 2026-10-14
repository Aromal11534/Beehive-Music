'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { usePlayer } from '@/context/PlayerContext';
import { FallbackImage } from '@/components/FallbackImage';
import { Icon } from '@/components/icons';
import { useGuilds } from '@/context/GuildContext';
import type { PlayerTrack, PlaylistSummary } from '@/lib/types';
import { api, ApiError } from '@/lib/api';

function getTrackTitle(track: PlayerTrack | null | undefined) {
  return track?.title || track?.track_title || 'Unknown Track';
}

function getTrackAuthor(track: PlayerTrack | null | undefined) {
  return track?.author || track?.track_author || 'Unknown Artist';
}

function isDuplicateError(error: unknown) {
  return error instanceof ApiError && (error.status === 409 || error.status === 400);
}

export function GlobalPlayer() {
  const { state, localPosition, connectionStatus, connectionError, isDraggingRef, sendCommand, commitSeek, handleVolumeChange } = usePlayer();
  const { guilds, selectedGuild } = useGuilds();

  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [localSeek, setLocalSeek] = useState<{ trackKey: string; value: number } | null>(null);

  useEffect(() => {
    api.get<PlaylistSummary[]>('/playlists').then((data) => {
      setPlaylists(Array.isArray(data) ? data : []);
    }).catch(() => { });
  }, []);

  const track = state?.current_track;
  const currentTitle = getTrackTitle(track);
  const currentAuthor = getTrackAuthor(track);
  const duration = track?.duration_ms || track?.duration || 0;
  const trackKey = `${selectedGuild || ''}:${track?.queue_id || track?.identifier || track?.track_identifier || track?.track_url || ''}`;
  const displayPosition = localSeek?.trackKey === trackKey ? localSeek.value : localPosition;
  const progress = duration ? Math.min((displayPosition / duration) * 100, 100) : 0;
  const selectedGuildName = guilds.find((g) => g.guild?.discord_guild_id === selectedGuild)?.guild?.name || 'Select Server';

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const showActionFeedback = (msg: string) => {
    toast.success(msg);
  };

  const handleAddFavorite = async () => {
    if (!track) return;
    try {
      await api.post('/favorites', {
        track_title: currentTitle || 'Unknown Title',
        track_author: currentAuthor || 'Unknown Artist',
        track_url: track.track_url || track.url || track.identifier || 'unknown',
        track_identifier: track.identifier || track.track_identifier || null,
        duration_ms: duration || 0,
        source: track.source || 'unknown',
        artwork_url: track.artwork_url || track.artworkUrl || null,
      });
      showActionFeedback('Added to Favorites');
    } catch (error: unknown) {
      if (isDuplicateError(error)) {
        toast.info('Already in Favorites');
      } else {
        console.error('Add to favorites error:', error);
        toast.error('Failed to add favorite');
      }
    }
  };

  const handleAddPlaylist = async (playlistId: number) => {
    if (!track) return;
    try {
      await api.post(`/playlists/${playlistId}/tracks`, {
        track_title: currentTitle || 'Unknown Title',
        track_author: currentAuthor || 'Unknown Artist',
        track_url: track.track_url || track.url || track.identifier || 'unknown',
        track_identifier: track.identifier || track.track_identifier || null,
        duration_ms: track.duration_ms || track.duration || duration || 0,
        source: track.source || 'unknown',
        artwork_url: track.artwork_url || track.artworkUrl || null,
      });
      setShowPlaylistMenu(false);
      showActionFeedback('Added to Playlist');
    } catch (error: unknown) {
      if (isDuplicateError(error)) {
        toast.info('Already in Playlist');
      } else {
        console.error('Add to playlist error:', error);
        toast.error('Failed to add to playlist');
      }
    }
  };

  const currentVolume = state?.volume ?? 100;
  const controlsDisabled = connectionStatus !== 'connected';

  const runCommand = async (action: string, value?: string | number | boolean | Record<string, unknown>) => {
    if (!(await sendCommand(action, value))) {
      toast.error(connectionError || 'Live player controls are disconnected.', { id: 'player-connection-error' });
    }
  };

  const finishSeek = async (value: number) => {
    setLocalSeek({ trackKey, value });
    if (!(await commitSeek(value))) {
      toast.error(connectionError || 'Live player controls are disconnected.', { id: 'player-connection-error' });
      setLocalSeek(null);
    } else {
      setTimeout(() => setLocalSeek(null), 400);
    }
  };

  const updateVolume = async (volume: number) => {
    if (!(await handleVolumeChange(volume))) {
      toast.error(connectionError || 'Live player controls are disconnected.', { id: 'player-connection-error' });
    }
  };

  if (!selectedGuild) return null;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 shrink-0 border-t border-white/10 bg-black/95 px-4 py-3 backdrop-blur-xl lg:left-64 transition-all duration-300">
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,280px)_minmax(320px,1fr)_minmax(0,280px)]">
        {/* Left: Track Info */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-800 shadow-md">
            <FallbackImage src={track?.artwork_url || ''} className="object-cover" sizes="56px" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{track ? currentTitle : 'Nothing playing'}</p>
            <p className="truncate text-xs text-zinc-400">{track ? currentAuthor : selectedGuildName}</p>
            {connectionError ? <p className="truncate text-[11px] text-red-300" title={connectionError}>{connectionError}</p> : controlsDisabled ? <p className="truncate text-[11px] text-red-300">Live controls disconnected</p> : null}
          </div>
        </div>

        {/* Center: Controls & Scrubber */}
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-2 flex items-center justify-center gap-5">
            <button onClick={handleAddFavorite} title="Add to Favorites" className="text-zinc-400 transition hover:text-emerald-400 hover:scale-110">
              <Icon name="star" className="h-4 w-4" />
            </button>
            <button disabled={controlsDisabled || !track} onClick={() => void runCommand('shuffle')} title="Shuffle" className="text-zinc-400 transition hover:text-white hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40">
              <Icon name="shuffle" className="h-4 w-4" />
            </button>
            <button disabled={controlsDisabled || !track} onClick={() => void runCommand('previous')} title="Previous / Restart" className="text-zinc-300 transition hover:text-white hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40">
              <Icon name="skip-back" className="h-5 w-5" />
            </button>
            <button
              disabled={controlsDisabled || !track}
              onClick={() => void runCommand(state?.is_playing ? 'pause' : 'resume')}
              title={state?.is_playing ? 'Pause' : 'Resume'}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name={state?.is_playing ? 'pause' : 'play'} className="h-5 w-5" />
            </button>
            <button disabled={controlsDisabled || !track} onClick={() => void runCommand('skip')} title="Skip" className="text-zinc-300 transition hover:text-white hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40">
              <Icon name="skip-forward" className="h-5 w-5" />
            </button>
            <button disabled={controlsDisabled || !track} onClick={() => void runCommand('loop', state?.loop_mode === 'queue' ? 'off' : 'queue')} title="Loop" className={`${state?.loop_mode !== 'off' ? 'text-emerald-400' : 'text-zinc-400 transition hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}>
              <Icon name="repeat" className="h-4 w-4" />
            </button>
            <button onClick={() => setShowPlaylistMenu(true)} title="Add to Playlist" className="text-zinc-400 transition hover:text-emerald-400 hover:scale-110">
              <Icon name="plus" className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-400 font-medium">
            <span className="w-10 text-right tabular-nums">{formatTime(displayPosition)}</span>
            <div className="group relative h-1.5 flex-1 rounded-full bg-zinc-800 flex items-center cursor-pointer">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-amber-400 group-hover:bg-amber-300 transition-colors pointer-events-none"
                style={{ width: `${progress}%` }}
              />
              <div
                className={`absolute h-3.5 w-3.5 -ml-1.75 rounded-full bg-white shadow-lg pointer-events-none transition-all duration-150 ${localSeek || isDraggingRef.current ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'}`}
                style={{ left: `${progress}%` }}
              />
              <input
                type="range"
                min="0"
                max={duration}
                value={displayPosition}
                disabled={controlsDisabled || duration <= 0}
                onPointerDown={() => {
                  isDraggingRef.current = true;
                  setLocalSeek({ trackKey, value: displayPosition });
                }}
                onPointerUp={(e) => {
                  void finishSeek(Number((e.target as HTMLInputElement).value));
                }}
                onPointerCancel={(e) => {
                  void finishSeek(Number((e.target as HTMLInputElement).value));
                }}
                onChange={(e) => setLocalSeek({ trackKey, value: Number(e.target.value) })}
                onKeyUp={(e) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                    void finishSeek(Number(e.currentTarget.value));
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </div>
            <span className="w-10 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume & Extras */}
        <div className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-2 w-32">
            <button
              onClick={() => {
                const newVol = currentVolume === 0 ? 100 : 0;
                void updateVolume(newVol);
              }}
              disabled={controlsDisabled}
              className="text-zinc-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name={currentVolume === 0 ? 'volume-x' : currentVolume < 50 ? 'volume-1' : 'volume-2'} className="h-4 w-4" />
            </button>
            <div className="relative h-1.5 flex-1 rounded-full bg-zinc-800 group">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white group-hover:bg-amber-400 transition-colors" style={{ width: `${currentVolume}%` }} />
              <input
                type="range"
                min="0"
                max="100"
                value={currentVolume}
                disabled={controlsDisabled}
                onChange={(e) => {
                  const vol = Number(e.target.value);
                  void updateVolume(vol);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>

      {showPlaylistMenu && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowPlaylistMenu(false) }}>
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(245,158,11,0.15),_transparent_80%)] pointer-events-none" />

            <div className="relative p-6 border-b border-white/5 flex justify-between items-start">
              <div className="flex flex-col gap-1 pr-4">
                <h3 className="text-xl font-black text-white">Add to Playlist</h3>
                <p className="text-sm text-zinc-400 line-clamp-1">For &quot;{currentTitle}&quot;</p>
              </div>
              <button onClick={() => setShowPlaylistMenu(false)} className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition shrink-0">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <div className="relative p-2 h-[300px] overflow-y-auto">
              {playlists.length === 0 ? (
                <div className="p-8 h-full flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                    <Icon name="disc" className="w-6 h-6 text-zinc-500" />
                  </div>
                  <p className="text-zinc-300 font-semibold">No playlists found</p>
                  <p className="text-xs text-zinc-500 mt-1">Create a playlist first</p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => handleAddPlaylist(playlist.id)}
                      className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center group-hover:bg-amber-500/20 group-hover:text-amber-400 text-zinc-500 transition shadow-inner shrink-0">
                        <Icon name="disc" className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-zinc-200 group-hover:text-white transition truncate">{playlist.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {playlist.track_count || 0} tracks &bull; <span className="capitalize">{playlist.playlist_type}</span> Playlist
                        </p>
                      </div>
                      <Icon name="plus" className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </footer>
  );
}
