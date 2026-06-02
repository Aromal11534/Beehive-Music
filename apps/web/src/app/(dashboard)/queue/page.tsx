'use client';

import { Icon } from '@/components/icons';

export default function QueuePage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="text-2xl font-bold text-zinc-100">Queue</h1>
      <div className="glass-card p-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
          <Icon name="queue" className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-300">Queue View</h2>
        <p className="text-zinc-500 mt-2">Live queue updates when music is playing. Use the Now Playing page to control playback.</p>
      </div>
    </div>
  );
}
