import React from 'react';

export function Waveform({ isPlaying, track }: { isPlaying: boolean; track: any }) {
  if (!track) return null;

  return (
    <div className="flex items-end gap-[3px] h-4 ml-3" title={isPlaying ? "Playing" : "Paused"}>
      <div className={`w-[3px] h-full bg-white/90 rounded-sm animate-wave ${isPlaying ? '' : 'animation-paused'}`} style={{ animationDelay: '0.0s' }} />
      <div className={`w-[3px] h-full bg-white/90 rounded-sm animate-wave ${isPlaying ? '' : 'animation-paused'}`} style={{ animationDelay: '0.2s' }} />
      <div className={`w-[3px] h-full bg-white/90 rounded-sm animate-wave ${isPlaying ? '' : 'animation-paused'}`} style={{ animationDelay: '0.5s' }} />
      <div className={`w-[3px] h-full bg-white/90 rounded-sm animate-wave ${isPlaying ? '' : 'animation-paused'}`} style={{ animationDelay: '0.1s' }} />
    </div>
  );
}
