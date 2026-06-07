'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { api } from '@/lib/api';
import type { PlayerTrack, PlaylistSummary } from '@/lib/types';
import { Icon } from '@/components/icons';
import { toast } from 'sonner';
import { usePlayer } from '@/context/PlayerContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function getTitle(t: PlayerTrack | null | undefined) {
  return t?.title || (t as any)?.track_title || 'Unknown Track';
}

function getAuthor(t: PlayerTrack | null | undefined) {
  return t?.author || (t as any)?.track_author || 'Unknown Artist';
}

function SortableQueueItem({ 
  item, 
  index, 
  onRemove, 
  onPlayNow, 
  onAddFavorite, 
  onAddPlaylist 
}: { 
  item: PlayerTrack, 
  index: number, 
  onRemove: () => void, 
  onPlayNow: () => void, 
  onAddFavorite: () => void, 
  onAddPlaylist: () => void 
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `track-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`group flex items-center gap-4 p-2 rounded hover:bg-zinc-800/50 transition ${isDragging ? 'bg-zinc-800/80 shadow-lg ring-1 ring-white/10' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing hover:text-white text-zinc-500 w-6 flex justify-center shrink-0">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </div>
      <span className="w-6 text-right text-zinc-500 text-sm font-medium shrink-0">{index + 1}</span>
      <div className="relative h-10 w-10 overflow-hidden rounded bg-zinc-800 shrink-0">
        {item.artwork_url ? (
          <Image src={item.artwork_url} alt="Artwork" fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500"><Icon name="music" className="h-4 w-4" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-zinc-200 text-sm truncate">{getTitle(item)}</h3>
        <p className="text-xs text-zinc-400 truncate">{getAuthor(item)}</p>
      </div>
      <div className="flex items-center gap-1 md:gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onAddFavorite} className="p-2 text-zinc-400 hover:text-emerald-400 transition rounded-full hover:bg-white/10" title="Add to Favorites">
          <Icon name="star" className="h-4 w-4" />
        </button>
        <button onClick={onAddPlaylist} className="p-2 text-zinc-400 hover:text-amber-400 transition rounded-full hover:bg-white/10" title="Add to Playlist">
          <Icon name="plus" className="h-4 w-4" />
        </button>
        <button onClick={onPlayNow} className="p-2 text-zinc-400 hover:text-white transition rounded-full hover:bg-white/10" title="Play Now">
          <Icon name="play" className="h-4 w-4" />
        </button>
        <button onClick={onRemove} className="p-2 text-zinc-400 hover:text-red-400 transition rounded-full hover:bg-white/10" title="Remove from Queue">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function QueuePage() {
  const { state, sendCommand } = usePlayer();
  const [optimisticQueue, setOptimisticQueue] = useState<PlayerTrack[]>([]);

  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [targetTrack, setTargetTrack] = useState<PlayerTrack | null>(null);

  useEffect(() => {
    api.get<PlaylistSummary[]>('/playlists').then((data) => {
      setPlaylists(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setOptimisticQueue(Array.isArray(state?.queue) ? state.queue : []);
  }, [state?.queue]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id && over) {
      const oldIndex = optimisticQueue.findIndex((_, i) => `track-${i}` === active.id);
      const newIndex = optimisticQueue.findIndex((_, i) => `track-${i}` === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      
      if (sendCommand('move', { from: oldIndex, to: newIndex })) {
        setOptimisticQueue((q) => arrayMove(q, oldIndex, newIndex));
      } else {
        toast.error('Player connection is not ready. Try again in a moment.');
      }
    }
  };

  const handleRemove = (index: number) => {
    if (sendCommand('remove', { index })) {
      setOptimisticQueue((q) => q.filter((_, i) => i !== index));
    } else {
      toast.error('Player connection is not ready. Try again in a moment.');
    }
  };

  const handlePlayNow = (index: number) => {
    if (!sendCommand('jump', { index })) {
      toast.error('Player connection is not ready. Try again in a moment.');
    }
  };

  const handleAddFavorite = async (track: PlayerTrack) => {
    try {
      await api.post('/favorites', {
        track_title: getTitle(track),
        track_author: getAuthor(track),
        track_url: (track as any).track_url || track.url || track.identifier || 'unknown',
        track_identifier: track.identifier || (track as any).track_identifier || null,
        duration_ms: track.duration_ms || track.duration || 0,
        source: track.source || (track as any).source || 'unknown',
        artwork_url: track.artwork_url || (track as any).artworkUrl || null,
      });
      toast.success('Added to Favorites');
    } catch (error: any) {
      if (error.response?.status === 409 || error.response?.status === 400) {
        toast.info('Already in Favorites');
      } else {
        toast.error(`Failed to add to favorites: ${error.message || 'Unknown error'}`);
      }
    }
  };

  const openPlaylistMenu = (track: PlayerTrack) => {
    setTargetTrack(track);
    setShowPlaylistMenu(true);
  };

  const handleAddPlaylist = async (playlistId: number) => {
    if (!targetTrack) return;
    try {
      await api.post(`/playlists/${playlistId}/tracks`, {
        track_title: getTitle(targetTrack),
        track_author: getAuthor(targetTrack),
        track_url: (targetTrack as any).track_url || targetTrack.url || targetTrack.identifier || 'unknown',
        track_identifier: targetTrack.identifier || (targetTrack as any).track_identifier || null,
        duration_ms: targetTrack.duration_ms || targetTrack.duration || 0,
        source: targetTrack.source || (targetTrack as any).source || 'unknown',
        artwork_url: targetTrack.artwork_url || (targetTrack as any).artworkUrl || null,
      });
      setShowPlaylistMenu(false);
      toast.success('Added to Playlist');
    } catch (error: any) {
      if (error.response?.status === 409 || error.response?.status === 400) {
        toast.info('Already in Playlist');
      } else {
        toast.error('Failed to add to playlist');
      }
    }
  };

  const track = state?.current_track;

  return (
    <div className="space-y-6 animate-slide-up relative pb-20">
      <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Queue</h1>
      
      {!track && optimisticQueue.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
            <Icon name="queue" className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-300">Queue is empty</h2>
          <p className="text-zinc-500 mt-2">Add some music to start the party.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {track && (
            <div className="glass-card p-4 ring-1 ring-amber-500/20 bg-amber-500/5 relative group">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">Now Playing</p>
              <div className="flex items-center gap-4">
                <div className="relative h-14 w-14 overflow-hidden rounded bg-zinc-800 shrink-0">
                  {track.artwork_url ? (
                    <Image src={track.artwork_url} alt="Artwork" fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-500"><Icon name="music" className="h-6 w-6" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-zinc-100">{getTitle(track)}</h3>
                  <p className="text-sm text-zinc-400">{getAuthor(track)}</p>
                </div>
                <div className="flex items-center gap-1 md:gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleAddFavorite(track)} className="p-2 text-zinc-400 hover:text-emerald-400 transition rounded-full hover:bg-white/10" title="Add to Favorites">
                    <Icon name="star" className="h-4 w-4" />
                  </button>
                  <button onClick={() => openPlaylistMenu(track)} className="p-2 text-zinc-400 hover:text-amber-400 transition rounded-full hover:bg-white/10" title="Add to Playlist">
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {optimisticQueue.length > 0 && (
            <div className="glass-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">{optimisticQueue.length} Tracks in Queue</p>
              
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={optimisticQueue.map((_, i) => `track-${i}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {optimisticQueue.map((item, index) => (
                      <SortableQueueItem
                        key={`track-${index}`}
                        index={index}
                        item={item}
                        onRemove={() => handleRemove(index)}
                        onPlayNow={() => handlePlayNow(index)}
                        onAddFavorite={() => handleAddFavorite(item)}
                        onAddPlaylist={() => openPlaylistMenu(item)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      )}

      {showPlaylistMenu && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowPlaylistMenu(false) }}>
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(245,158,11,0.15),_transparent_80%)] pointer-events-none" />
            
            <div className="relative p-6 border-b border-white/5 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-white">Add to Playlist</h3>
                <p className="text-sm text-zinc-400 mt-1">Select a destination for "{targetTrack ? getTitle(targetTrack) : 'Track'}"</p>
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
                  <p className="text-zinc-300 font-semibold">No playlists found</p>
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
                        <p className="font-semibold text-zinc-200 group-hover:text-white transition truncate">{playlist.name}</p>
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
    </div>
  );
}
