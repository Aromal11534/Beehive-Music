const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
const CONFIGURED_REDIRECT_URI = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI?.trim();

export type DiscordOAuthState = 'login' | 'sync';

export function getDiscordRedirectUri() {
  if (CONFIGURED_REDIRECT_URI) return CONFIGURED_REDIRECT_URI;
  if (typeof window === 'undefined') return null;

  return `${window.location.origin}/auth/discord/callback`;
}

export function getDiscordOAuthUrl(state: DiscordOAuthState) {
  const redirectUri = getDiscordRedirectUri();
  if (!DISCORD_CLIENT_ID || !redirectUri) return null;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds email',
    state,
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}
