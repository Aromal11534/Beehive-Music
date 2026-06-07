'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandMark, Icon, type IconName } from '@/components/icons';
import { getApiBase } from '@/lib/api';
import { TopSearchBar } from '@/components/TopSearchBar';
import { GuildProvider } from '@/context/GuildContext';
import { PlayerProvider } from '@/context/PlayerContext';
import { GlobalPlayer } from '@/components/GlobalPlayer';

const navigation: Array<{ name: string; href: string; icon: IconName }> = [
  { name: 'Now Playing', href: '/', icon: 'music' },
  { name: 'Dashboard', href: '/dashboard', icon: 'chart' },
  { name: 'Queue', href: '/queue', icon: 'queue' },
  { name: 'Playlists', href: '/playlists', icon: 'disc' },
  { name: 'Favorites', href: '/favorites', icon: 'star' },
  { name: 'History', href: '/history', icon: 'clock' },
  { name: 'Servers', href: '/servers', icon: 'server' },
  { name: 'Settings', href: '/settings', icon: 'settings' },
];

const adminNav: Array<{ name: string; href: string; icon: IconName }> = [
  { name: 'Admin', href: '/admin', icon: 'shield' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mx-auto mb-4 animate-pulse-glow">
            <BrandMark className="h-9 w-9 text-zinc-950" />
          </div>
          <p className="text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const allNav = [...navigation, ...(user?.is_admin ? adminNav : [])];
  const avatarFilename = user?.avatar_path ? user.avatar_path.split(/[/\\]/).pop() : null;
  const avatarUrl = avatarFilename ? `${getApiBase()}/avatars/${avatarFilename}` : null;

  return (
    <GuildProvider>
      <PlayerProvider>
        <div className="h-screen bg-zinc-950 flex overflow-hidden">
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-900/95 backdrop-blur-xl border-r border-zinc-800/50 transform transition-transform duration-300 lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Logo */}
          <div className="h-16 flex items-center gap-3 px-6 border-b border-zinc-800/50">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <BrandMark className="h-5 w-5 text-zinc-950" />
            </div>
            <span className="text-lg font-semibold text-zinc-100">Beehive Music</span>
          </div>

          {/* Nav items */}
          <nav className="p-4 space-y-1">
            {allNav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-400 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-zinc-800/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-amber-400 font-semibold overflow-hidden shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  user?.display_name?.[0]?.toUpperCase() || '?'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{user?.display_name}</p>
                <p className="text-xs text-zinc-500 truncate">@{user?.username}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full px-3 py-2 text-sm text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col h-screen min-w-0">
          {/* Header */}
          <header className="h-16 shrink-0 border-b border-zinc-800/50 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-30">
            <div className="flex items-center flex-1">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-zinc-400 hover:text-zinc-200 transition mr-4"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="hidden lg:block text-sm text-zinc-500 font-medium w-32">
                {allNav.find(n => n.href === pathname)?.name || 'Beehive'}
              </div>
              <div className="flex-1 max-w-2xl px-4 hidden sm:block">
                <TopSearchBar />
              </div>
            </div>
            <div className="text-xs text-zinc-600 font-medium">
              beehive.teamsyndicate.org
            </div>
          </header>

          {/* Mobile Search Bar (visible only on small screens below the header) */}
          <div className="sm:hidden px-4 py-2 bg-zinc-900/50 border-b border-zinc-800/50">
            <TopSearchBar />
          </div>

          {/* Page content */}
          <main className="flex-1 p-6 pb-28 min-h-0 overflow-y-auto animate-fade-in flex flex-col relative">
            {children}
          </main>
        </div>
        
        <GlobalPlayer />
      </div>
      </PlayerProvider>
    </GuildProvider>
  );
}
