import { useState } from 'react';
import Image from 'next/image';
import { Icon, type IconName } from '@/components/icons';

interface FallbackImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  sizes?: string;
  fallbackIcon?: IconName;
  fallbackClassName?: string;
}

export function FallbackImage({ 
  src, 
  alt = "", 
  className = "", 
  sizes,
  fallbackIcon = "music",
  fallbackClassName = "text-emerald-500/50 bg-zinc-800"
}: FallbackImageProps) {
  const optimizedSrc = src?.replace('maxresdefault.jpg', 'mqdefault.jpg');

  return (
    <FallbackImageSource
      key={optimizedSrc || 'missing-image'}
      src={optimizedSrc}
      alt={alt}
      className={className}
      sizes={sizes}
      fallbackIcon={fallbackIcon}
      fallbackClassName={fallbackClassName}
    />
  );
}

function FallbackImageSource({
  src,
  alt,
  className,
  sizes,
  fallbackIcon,
  fallbackClassName,
}: Required<Pick<FallbackImageProps, 'alt' | 'className' | 'fallbackIcon' | 'fallbackClassName'>> & Pick<FallbackImageProps, 'src' | 'sizes'>) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(Boolean(src));

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
        src={src}
        alt={alt} 
        fill
        sizes={sizes}
        unoptimized
        className={`${className} absolute inset-0 h-full w-full transition-opacity duration-150 ${loading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
      />
    </>
  );
}
