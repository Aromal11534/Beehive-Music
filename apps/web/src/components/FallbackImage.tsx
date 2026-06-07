import { useState, useEffect } from 'react';
import Image from 'next/image';
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

  // Reset state when the image source changes
  useEffect(() => {
    setError(false);
    setLoading(true);
  }, [src]);

  if (!src || error) {
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
      <Image 
        unoptimized
        src={src} 
        alt={alt} 
        fill={fill} 
        className={`${className} transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`} 
        sizes={sizes}
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
      />
    </>
  );
}
