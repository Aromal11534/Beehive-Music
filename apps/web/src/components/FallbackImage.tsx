import { useState, useEffect, useRef } from 'react';
import { Icon, type IconName } from '@/components/icons';

interface FallbackImageProps {
  src?: string | null;
  alt?: string;
  fill?: boolean;
  className?: string;
  sizes?: string;
  fallbackIcon?: IconName;
  fallbackClassName?: string;
}

export function FallbackImage({ 
  src, 
  alt = "", 
  fill = true, 
  className = "", 
  sizes,
  fallbackIcon = "music",
  fallbackClassName = "text-emerald-500/50 bg-zinc-800"
}: FallbackImageProps) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  // YouTube's maxresdefault.jpg frequently 404s for non-1080p videos.
  const optimizedSrc = src?.replace('maxresdefault.jpg', 'mqdefault.jpg');

  // Reset state when the image source changes
  useEffect(() => {
    setError(false);
    setLoading(true);
  }, [src]);

  // Check if image is already loaded from cache to prevent perpetual loading state
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoading(false);
    }
  }, [optimizedSrc]);

  if (!optimizedSrc || error) {
    return (
      <div className={`absolute inset-0 flex h-full w-full items-center justify-center ${fallbackClassName}`}>
        <Icon name={fallbackIcon} className="h-1/2 w-1/2" />
      </div>
    );
  }

  return (
    <>
      {loading && (
        <div className={`absolute inset-0 flex h-full w-full items-center justify-center ${fallbackClassName} animate-pulse`}>
          <Icon name={fallbackIcon} className="h-1/2 w-1/2 opacity-30" />
        </div>
      )}
      <img 
        ref={imgRef}
        src={optimizedSrc} 
        alt={alt} 
        loading="lazy"
        className={`${className} transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'} ${fill ? 'absolute inset-0 w-full h-full' : ''}`} 
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
      />
    </>
  );
}
