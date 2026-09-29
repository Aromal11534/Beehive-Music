'use client';

import { useState } from 'react';
import { BrandMark } from '@/components/icons';
import { getDiscordOAuthUrl } from '@/lib/discord-oauth';

export default function LoginPage() {
  const [error, setError] = useState('');

  const handleDiscordLogin = () => {
    setError('');
    const oauthUrl = getDiscordOAuthUrl('login');

    if (!oauthUrl) {
      setError('Discord OAuth is not configured.');
      return;
    }

    window.location.assign(oauthUrl);
  };

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-zinc-950 lg:grid-cols-2">
      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-zinc-950 p-12 lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-zinc-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.15),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.05),_transparent_40%)]" />
        <div className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-32 bg-gradient-to-l from-zinc-950 to-transparent" />

        <div className="relative z-10 flex max-w-lg flex-col items-center pr-12 text-center animate-fade-in">
          <BrandMark className="mb-8 h-24 w-24 rounded-[2rem] shadow-2xl shadow-amber-500/30" />
          <h1 className="mb-4 text-5xl font-semibold tracking-tight text-white">Beehive Music</h1>
          <p className="text-lg font-medium leading-relaxed text-zinc-400">
            The music control panel for your Discord servers. Sync, play, and manage queues beautifully.
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center bg-zinc-950 p-6 animate-fade-in sm:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(88,101,242,0.08)_0%,_transparent_70%)]" />

        <div className="relative w-full max-w-md lg:-ml-12">
          <div className="mb-8 text-center lg:hidden">
            <BrandMark className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-xl shadow-amber-500/20" />
            <h1 className="text-3xl font-semibold text-white">Beehive Music</h1>
          </div>

          <div className="glass-card bg-zinc-900/80 p-8 text-center shadow-2xl ring-1 ring-white/5 backdrop-blur-xl">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5865F2]/15 text-[#8b97ff]">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.516.074.074 0 00-.079.037c-.211.376-.445.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.618-1.25.077.077 0 00-.078-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.028C.533 9.046-.319 13.58.1 18.058a.082.082 0 00.031.056c2.053 1.508 4.041 2.423 5.993 3.03a.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 12.3 12.3 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.099.246.198.373.292a.077.077 0 01-.007.128c-.598.343-1.22.645-1.873.891a.077.077 0 00-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 00.084.029c1.961-.607 3.95-1.522 6.002-3.03a.077.077 0 00.031-.055c.501-5.178-.838-9.674-3.548-13.66a.061.061 0 00-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419s.956-2.419 2.157-2.419c1.211 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419s.955-2.419 2.157-2.419c1.211 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z" />
              </svg>
            </div>

            <h2 className="text-2xl font-semibold text-zinc-100">Continue with Discord</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Sign in with the Discord account you use to manage and listen in your servers.
            </p>

            {error ? (
              <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleDiscordLogin}
              className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-[#5865F2] px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#5865F2]/20 transition hover:bg-[#6875f5] hover:shadow-[#5865F2]/30 focus:outline-none focus:ring-2 focus:ring-[#8b97ff]/70 focus:ring-offset-2 focus:ring-offset-zinc-900"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.516.074.074 0 00-.079.037c-.211.376-.445.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.618-1.25.077.077 0 00-.078-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.028C.533 9.046-.319 13.58.1 18.058a.082.082 0 00.031.056c2.053 1.508 4.041 2.423 5.993 3.03a.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 12.3 12.3 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.099.246.198.373.292a.077.077 0 01-.007.128c-.598.343-1.22.645-1.873.891a.077.077 0 00-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 00.084.029c1.961-.607 3.95-1.522 6.002-3.03a.077.077 0 00.031-.055c.501-5.178-.838-9.674-3.548-13.66a.061.061 0 00-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419s.956-2.419 2.157-2.419c1.211 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419s.955-2.419 2.157-2.419c1.211 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z" />
              </svg>
              Continue with Discord
            </button>

            <p className="mt-5 text-xs text-zinc-600">A Discord account is required to use Beehive Music.</p>
          </div>

          <p className="mt-8 text-center text-xs font-medium text-zinc-600">
            Beehive Music | beehive.teamsyndicate.org
          </p>
        </div>
      </div>
    </div>
  );
}
