'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getDiscordOAuthUrl } from '@/lib/discord-oauth';
import type { GuildAccess } from '@/lib/types';
import { Icon } from '@/components/icons';
import Link from 'next/link';
import { useGuilds } from '@/context/GuildContext';

const DISCORD_BOT_PERMISSIONS = '36785152';

function getDiscordInviteUrl() {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    permissions: DISCORD_BOT_PERMISSIONS,
    scope: 'bot applications.commands',
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export default function ServersPage() {
  const [guilds, setGuilds] = useState<GuildAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const { removeGuild: removeGuildFromContext } = useGuilds();
  const inviteUrl = getDiscordInviteUrl();

  useEffect(() => {
    let cancelled = false;
    void api.get<GuildAccess[]>('/guilds/my').then((data) => {
      if (!cancelled) setGuilds(Array.isArray(data) ? data : []);
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load servers.');
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleConnectDiscord = () => {
    const connectUrl = getDiscordOAuthUrl('sync');
    if (!connectUrl) {
      setLoadError('Discord OAuth is not configured. Check the public client ID and redirect URI.');
      return;
    }
    window.location.assign(connectUrl);
  };

  const retryLoad = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<GuildAccess[]>('/guilds/my');
      setGuilds(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load servers.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveBot = async (guildId: number) => {
    if (!window.confirm('Are you sure you want to remove the bot from this server?')) return;
    setRemovingId(guildId);
    try {
      await api.post(`/guilds/${guildId}/leave`);
      setGuilds((prev) => prev.filter((g) => g.guild_id !== guildId));
      removeGuildFromContext(guildId);
    } catch (e: unknown) {
      alert(`Failed to remove bot: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Servers</h1>
          <p className="text-sm text-zinc-500 mt-1">Connect Beehive to Discord servers where you have permission to add apps.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
              type="button"
              onClick={handleConnectDiscord}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5865F2]/10 px-4 py-2.5 text-sm font-semibold text-[#5865F2] hover:bg-[#5865F2]/20 transition border border-[#5865F2]/20"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" /></svg>
              Connect Discord
          </button>
          {inviteUrl ? (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/10 transition hover:from-amber-400 hover:to-amber-500"
            >
              <Icon name="server" className="h-4 w-4" />
              Add to Discord
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Set NEXT_PUBLIC_DISCORD_CLIENT_ID to enable Discord invites."
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-500"
            >
              <Icon name="server" className="h-4 w-4" />
              Add to Discord
            </button>
          )}
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div>
      ) : null}

      <div className="glass-card p-5 border-amber-500/10">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Icon name="shield" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-200">Invite requirements</h2>
            <p className="mt-1 text-sm text-zinc-500">Discord will show servers where your account can add apps. The invite includes bot access and slash command registration.</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-zinc-400"><Icon name="loader" className="mr-2 h-5 w-5 animate-spin" /> Loading servers...</div>
      ) : loadError && guilds.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <h2 className="text-xl font-semibold text-zinc-300">Could not load servers</h2>
          <p className="mt-2 text-zinc-500">Check the API connection and try again.</p>
          <button onClick={() => void retryLoad()} className="mt-5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15">Try again</button>
        </div>
      ) : guilds.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {guilds.map((access) => (
            <div key={access.id} className="glass-card p-5 hover:border-amber-500/20 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-xl"><Icon name="server" className="h-6 w-6 text-amber-400" /></div>
                <div>
                  <h3 className="font-semibold text-zinc-200">{access.guild?.name || 'Unknown Server'}</h3>
                  <p className="text-xs text-zinc-500">Role: {access.role}</p>
                </div>
              </div>
              <div className="flex justify-between items-center mt-3">
                <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs">Connected</span>
                {access.role === 'admin' && (
                  <div className="flex gap-2">
                    <Link
                      href={`/servers/${access.guild_id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
                      View Server
                    </Link>
                    <button
                      onClick={() => handleRemoveBot(access.guild_id)}
                      disabled={removingId === access.guild_id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {removingId === access.guild_id ? 'Removing...' : 'Remove Bot'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
            <Icon name="server" className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-300">No Servers</h2>
          <p className="text-zinc-500 mt-2">Ask an admin to grant you server access</p>
        </div>
      )}
    </div>
  );
}
