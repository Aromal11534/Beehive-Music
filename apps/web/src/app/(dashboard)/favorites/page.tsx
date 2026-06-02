'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { FavoriteTrack } from '@/lib/types';
import { Icon } from '@/components/icons';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);

  useEffect(() => {
    api.get<FavoriteTrack[]>('/favorites').then(setFavorites).catch(() => {});
  }, []);

  const removeFavorite = async (id: number) => {
    await api.delete(`/favorites/${id}`);
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="text-2xl font-bold text-zinc-100">Favorites</h1>

      {favorites.length > 0 ? (
        <div className="space-y-3">
          {favorites.map((fav) => (
            <div key={fav.id} className="glass-card p-4 flex items-center gap-4 hover:border-amber-500/20 transition">
              <div className="w-12 h-12 rounded-lg bg-zinc-700/50 flex items-center justify-center text-amber-400"><Icon name="star" className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-200 truncate">{fav.track_title}</p>
                <p className="text-sm text-zinc-500">{fav.track_author || 'Unknown'}</p>
              </div>
              <button onClick={() => removeFavorite(fav.id)} className="px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-sm transition">
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
            <Icon name="star" className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-300">No Favorites</h2>
          <p className="text-zinc-500 mt-2">Use <code className="px-2 py-0.5 bg-zinc-800 rounded text-amber-400">/favorites add</code> to save tracks</p>
        </div>
      )}
    </div>
  );
}
