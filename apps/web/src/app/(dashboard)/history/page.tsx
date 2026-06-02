'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TrackHistoryEntry } from '@/lib/types';
import { Icon } from '@/components/icons';

export default function HistoryPage() {
  const [history, setHistory] = useState<TrackHistoryEntry[]>([]);

  useEffect(() => {
    api.get<TrackHistoryEntry[]>('/history?limit=50').then(setHistory).catch(() => {});
  }, []);

  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="text-2xl font-bold text-zinc-100">Play History</h1>

      {history.length > 0 ? (
        <div className="space-y-2">
          {history.map((entry, i) => (
            <div key={i} className="glass-card p-4 flex items-center gap-4 hover:border-amber-500/10 transition">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 text-sm"><Icon name="clock" className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-200 truncate">{entry.track_title}</p>
                <p className="text-sm text-zinc-500">{entry.track_author || 'Unknown'}</p>
              </div>
              <span className="text-xs text-zinc-600 whitespace-nowrap">
                {new Date(entry.played_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
            <Icon name="clock" className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-300">No History</h2>
          <p className="text-zinc-500 mt-2">Tracks you play will appear here</p>
        </div>
      )}
    </div>
  );
}
