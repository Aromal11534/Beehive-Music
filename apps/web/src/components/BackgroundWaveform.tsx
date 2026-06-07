import React, { useMemo } from 'react';

export function BackgroundWaveform({ isPlaying, track }: { isPlaying: boolean; track: any }) {
  const bars = useMemo(() => {
    return Array.from({ length: 120 }).map((_, i) => ({
      id: i,
      delay: `${(Math.random() * 1.2).toFixed(2)}s`,
      height: `${30 + Math.random() * 70}%`,
    }));
  }, []);

  if (!track) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-full max-h-32 flex items-end justify-between gap-[2px] px-2 md:px-6 opacity-10 pointer-events-none overflow-hidden z-0 mask-image-linear">
      {bars.map(bar => (
        <div 
          key={bar.id}
          className={`w-full bg-white rounded-t-sm animate-wave ${isPlaying ? '' : 'animation-paused'}`}
          style={{ 
            animationDelay: bar.delay,
            height: bar.height,
            transformOrigin: 'bottom'
          }}
        />
      ))}
    </div>
  );
}
