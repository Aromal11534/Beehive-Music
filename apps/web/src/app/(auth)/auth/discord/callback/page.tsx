'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getDiscordRedirectUri } from '@/lib/discord-oauth';
import { useAuth } from '@/context/AuthContext';

interface DiscordSyncResponse {
  discord_username: string;
  synced_guilds: number;
}

interface DiscordLoginResponse {
  access_token: string;
  refresh_token: string;
}

function DiscordCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuthData } = useAuth();
  const [status, setStatus] = useState('Connecting to Discord...');
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (hasAttempted.current) return;
    
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    if (error) {
      setTimeout(() => setStatus(`Discord connection failed: ${error}`), 0);
      setTimeout(() => router.push('/servers'), 3000);
      return;
    }

    if (!code) {
      setTimeout(() => setStatus('Invalid callback URL.'), 0);
      setTimeout(() => router.push('/servers'), 3000);
      return;
    }

    hasAttempted.current = true;

    const redirectUri = getDiscordRedirectUri();
    if (!redirectUri) {
      setTimeout(() => setStatus('Discord OAuth is not configured.'), 0);
      setTimeout(() => router.push('/login'), 3000);
      return;
    }

    if (state === 'login') {
      setTimeout(() => setStatus('Logging you in...'), 0);
      
      api.post<DiscordLoginResponse>('/auth/discord/login', {
        code,
        redirect_uri: redirectUri
      })
        .then(async (res) => {
          await setAuthData(res);
          setStatus('Success! Redirecting...');
          setTimeout(() => router.push('/'), 1500);
        })
        .catch((error: unknown) => {
          console.error('Discord login error:', error);
          setStatus('Failed to login via Discord.');
          setTimeout(() => router.push('/login'), 3000);
        });
        
    } else {
      setTimeout(() => setStatus('Syncing servers...'), 0);

      api.post<DiscordSyncResponse>('/auth/discord/sync', {
        code,
        redirect_uri: redirectUri
      })
        .then((res) => {
          setStatus(`Success! Linked as ${res.discord_username}. Synced ${res.synced_guilds} server(s).`);
          setTimeout(() => router.push('/servers'), 3000);
        })
        .catch((error: unknown) => {
          console.error('Discord sync error:', error);
          setStatus('Failed to connect to Discord. Ensure the server is configured properly.');
          setTimeout(() => router.push('/servers'), 3000);
        });
    }
  }, [searchParams, router, setAuthData]);

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <div className="glass-card p-12 text-center max-w-md w-full animate-slide-up">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#5865F2]/20 text-[#5865F2]">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
             <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-200 mb-2">Discord Authentication</h2>
        <p className="text-zinc-400">{status}</p>
        <div className="mt-8">
          <div className="w-8 h-8 border-4 border-zinc-700 border-t-[#5865F2] rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    </div>
  );
}

export default function DiscordCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading...</div>
      </div>
    }>
      <DiscordCallbackInner />
    </Suspense>
  );
}
