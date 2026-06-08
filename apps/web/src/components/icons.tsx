import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'admin'
  | 'arrow-left'
  | 'arrow-right'
  | 'chart'
  | 'check-circle'
  | 'clock'
  | 'disc'
  | 'headphones'
  | 'library'
  | 'loader'
  | 'lock'
  | 'more-horizontal'
  | 'music'
  | 'pause'
  | 'play'
  | 'queue'
  | 'repeat'
  | 'repeat-one'
  | 'search'
  | 'server'
  | 'settings'
  | 'shield'
  | 'shuffle'
  | 'skip-back'
  | 'skip-forward'
  | 'sliders'
  | 'star'
  | 'trash'
  | 'users'
  | 'volume'
  | 'volume-x'
  | 'volume-1'
  | 'volume-2'
  | 'x'
  | 'plus'
  | 'list-plus'
  | 'refresh-cw';

const paths: Record<IconName, ReactElement> = {
  admin: <path d="M12 3l7 3v5c0 4.5-2.9 8.7-7 10-4.1-1.3-7-5.5-7-10V6l7-3z M9.5 12l1.8 1.8 3.7-4" />,
  'arrow-left': <path d="M19 12H5m6-6-6 6 6 6" />,
  'arrow-right': <path d="M5 12h14m-6-6 6 6-6 6" />,
  chart: <path d="M4 19V5m0 14h16M8 16V9m4 7V6m4 10v-4" />,
  'check-circle': <path d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z M8.5 12l2.2 2.2 4.8-5" />,
  clock: <path d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z M12 7v5l3 2" />,
  disc: <path d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />,
  headphones: <path d="M4 14v-2a8 8 0 0 1 16 0v2M6 14h2v6H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2zM18 14h-2v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z" />,
  library: <path d="M5 5h3v14H5zM10.5 5h3v14h-3zM16 6l3 12" />,
  loader: <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
  lock: <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" />,
  'more-horizontal': <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  music: <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z" />,
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5v14l11-7-11-7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  'list-plus': <><path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/></>,
  queue: <path d="M4 7h16M4 12h16M4 17h10" />,
  'refresh-cw': <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
  repeat: <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
  'repeat-one': <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3M12 9v6" />,
  search: <path d="M18 18l3 3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z" />,
  server: <path d="M5 4h14v6H5zM5 14h14v6H5zM8 7h.01M8 17h.01" />,
  settings: <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M4 12h2m12 0h2M12 4v2m0 12v2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  shuffle: <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />,
  'skip-back': <path d="M19 20L9 12l10-8v16zM5 19V5" />,
  'skip-forward': <path d="M5 4l10 8-10 8V4zM19 5v14" />,
  sliders: <path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6" />,
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  trash: <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />,
  users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m8-14a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm14 14v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75" />,
  volume: <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />,
  'volume-x': <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />,
  'volume-1': <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07" />,
  'volume-2': <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
};

export function Icon({ name, className = 'h-5 w-5', ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}

export function BrandMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <img src="/beehive.png" alt="Beehive Music Logo" className={`object-contain ${className}`} />
  );
}
