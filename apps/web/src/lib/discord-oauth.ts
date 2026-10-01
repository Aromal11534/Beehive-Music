const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
const CONFIGURED_REDIRECT_URI = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI?.trim();
const OAUTH_STATE_STORAGE_KEY = 'beehive_discord_oauth_state';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export type DiscordOAuthState = 'login' | 'sync';

interface StoredDiscordOAuthState {
  flow: DiscordOAuthState;
  nonce: string;
  state: string;
  createdAt: number;
}

export function getDiscordRedirectUri() {
  if (CONFIGURED_REDIRECT_URI) return CONFIGURED_REDIRECT_URI;
  if (typeof window === 'undefined') return null;

  return `${window.location.origin}/auth/discord/callback`;
}

function createNonce() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getDiscordOAuthUrl(flow: DiscordOAuthState) {
  const redirectUri = getDiscordRedirectUri();
  if (!DISCORD_CLIENT_ID || !redirectUri || typeof window === 'undefined') return null;

  const nonce = createNonce();
  const state = `${flow}.${nonce}`;
  const storedState: StoredDiscordOAuthState = {
    flow,
    nonce,
    state,
    createdAt: Date.now(),
  };

  try {
    window.sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, JSON.stringify(storedState));
  } catch {
    return null;
  }

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds email',
    state,
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export function consumeDiscordOAuthState(returnedState: string | null): DiscordOAuthState | null {
  if (typeof window === 'undefined') return null;

  let rawState: string | null = null;
  try {
    rawState = window.sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
    window.sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!returnedState || !rawState) return null;

  try {
    const stored = JSON.parse(rawState) as Partial<StoredDiscordOAuthState>;
    const now = Date.now();
    const flow = stored.flow;
    const isValidFlow = flow === 'login' || flow === 'sync';
    const isFresh = typeof stored.createdAt === 'number'
      && stored.createdAt <= now
      && now - stored.createdAt <= OAUTH_STATE_MAX_AGE_MS;

    if (
      !isValidFlow
      || typeof stored.nonce !== 'string'
      || stored.nonce.length !== 64
      || stored.state !== `${flow}.${stored.nonce}`
      || returnedState !== stored.state
      || !isFresh
    ) {
      return null;
    }

    return flow === 'login' || flow === 'sync' ? flow : null;
  } catch {
    return null;
  }
}
