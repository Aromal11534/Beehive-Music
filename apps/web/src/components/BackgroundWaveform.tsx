import type { PlayerTrack } from '@/lib/types';

const WAVEFORM_BARS = Array.from({ length: 120 }, (_, id) => ({
  id,
  delay: `${(((id * 37 + 17) % 120) / 100).toFixed(2)}s`,
  height: `${30 + ((id * 53 + 11) % 71)}%`,
}));

export function BackgroundWaveform({ isPlaying, track }: { isPlaying: boolean; track: PlayerTrack | null | undefined }) {

  if (!track) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-full max-h-32 flex items-end justify-between gap-[2px] opacity-10 pointer-events-none overflow-hidden z-0 mask-image-linear">
      {WAVEFORM_BARS.map(bar => (
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
