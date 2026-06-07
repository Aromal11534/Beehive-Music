import { useState } from 'react';
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

  if (!src || error) {
    return (
      <div className={`flex h-full w-full items-center justify-center ${fallbackClassName} ${className}`}>
        <Icon name={fallbackIcon} className="h-1/2 w-1/2" />
      </div>
    );
  }

  return (
    <Image 
      unoptimized 
      src={src} 
      alt={alt} 
      fill={fill} 
      className={className} 
      sizes={sizes}
      onError={() => setError(true)}
    />
  );
}
