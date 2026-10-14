/**
 * Beehive Bot — Main entry point
 */

import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config';
import { BotCommand, QueueTrack } from './types';
import { MusicManager } from './music/MusicManager';
import { RedisService } from './services/RedisService';
import { GuildSyncService } from './services/GuildSyncService';

// Import commands
import { play, setMusicManager as setPlayMM } from './commands/music/play';
import { pause, resume, stop, skip, previous, nowplaying, volume, seek, search, autoplay, setMusicManager as setControlsMM } from './commands/music/controls';
import { queue, shuffle, loop, clear, remove, move, jump, setMusicManager as setQueueMM } from './commands/queue/queue';
import { playlist } from './commands/playlist/playlist';
import { favorites, setMusicManager as setFavMM } from './commands/favorites/favorites';
import { help } from './commands/general/help';
import { serverPlayer } from './commands/settings/serverPlayer';

// Extend Client to hold commands
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, BotCommand>;
    musicManager: MusicManager;
  }
}

interface WebPlayableTrack {
  encoded?: string;
  title?: string;
  author?: string;
  url?: string;
  identifier?: string;
  duration?: number;
  artwork_url?: string;
  artworkUrl?: string;
  source?: string;
}

interface WebPlayRequest {
  request_id?: string;
  guild_id?: string;
  track?: WebPlayableTrack;
  tracks?: WebPlayableTrack[];
  action?: string;
  user_discord_id?: string;
  max_queue_size?: number;
  max_song_duration_ms?: number;
}

async function acknowledgePlayRequest(
  redis: RedisService,
  requestId: string | undefined,
  result: { ok: boolean; error?: string }
): Promise<void> {
  if (!requestId) return;
  const resultKey = `play_result:${requestId}`;
  const readyKey = `play_ready:${requestId}`;
  await redis.set(resultKey, JSON.stringify(result), 30);
  await redis.client.lpush(readyKey, '1');
  await redis.client.expire(readyKey, 30);
}

async function acknowledgeWebCommand(
  redis: RedisService,
  guildId: string,
  requestId: unknown,
  result: { ok: boolean; error?: string }
): Promise<void> {
  if (typeof requestId !== 'string' || !requestId) return;
  await redis.publish(`player:${guildId}`, JSON.stringify({
    type: 'command_result',
    request_id: requestId,
    ...result,
  }));
}

function isValidSignedLeaveCommand(guildId: string, command: Record<string, unknown>): boolean {
  if (!config.internalApiToken || config.internalApiToken.length < 32) return false;
  const userId = typeof command.user_id === 'string' ? command.user_id : '';
  const issuedAt = typeof command.issued_at === 'number' ? command.issued_at : 0;
  const signature = typeof command.signature === 'string' ? command.signature : '';
  if (!userId || !issuedAt || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - issuedAt) > 30) return false;

  const payload = `${guildId}:leave:${userId}:${issuedAt}`;
  const expected = createHmac('sha256', config.internalApiToken).update(payload).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function main() {
  console.log('🐝 Starting Beehive Bot...');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  // Initialize services
  const redis = new RedisService();
  const musicManager = new MusicManager(client, redis);

  // Inject music manager into commands
  setPlayMM(musicManager);
  setControlsMM(musicManager);
  setQueueMM(musicManager);
  setFavMM(musicManager);

  // Register commands
  client.commands = new Collection<string, BotCommand>();
  const commands: BotCommand[] = [
    play, pause, resume, stop, skip, previous, nowplaying,
    volume, seek, search, autoplay,
    queue, shuffle, loop, clear, remove, move, jump,
    playlist, favorites, help, serverPlayer,
  ];

  for (const cmd of commands) {
    client.commands.set(cmd.data.name, cmd);
  }

  client.musicManager = musicManager;

  // Event: Ready
  const guildSync = new GuildSyncService(client);

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
    console.log(`📡 Serving ${readyClient.guilds.cache.size} guild(s)`);

    await musicManager.connectLavalink().catch((error) => {
      console.error('[Lavalink] Failed to connect on startup:', error);
    });

    await musicManager.restoreQueues(readyClient.guilds.cache.keys());

    // Sync guilds to API database
    await guildSync.syncGuilds();
  });

  // Event: Guild joined — sync the new guild
  client.on(Events.GuildCreate, async () => {
    await guildSync.syncGuilds();
  });

  // Event: Interaction
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Command Error] ${interaction.commandName}:`, error);
      const content = 'An error occurred while executing this command.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true }).catch(() => { });
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => { });
      }
    }
  });

  const getAuthorizedVoiceChannel = async (
    guildId: string,
    userId: unknown
  ): Promise<string | null> => {
    if (typeof userId !== 'string' || !userId) return null;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    const member = await guild.members.fetch(userId).catch(() => null);
    const memberChannelId = member?.voice.channel?.id;
    if (!memberChannelId) return null;

    const activeChannelId = musicManager.shoukaku.connections.get(guildId)?.channelId;
    if (activeChannelId && activeChannelId !== memberChannelId) return null;
    return memberChannelId;
  };

  // Subscribe to web commands from Redis
  await redis.psubscribe('web_command:*', async (channel, message) => {
    const guildId = channel.split(':')[1];
    if (!guildId) return;

    let command: Record<string, unknown> = {};
    try {
      command = JSON.parse(message) as Record<string, unknown>;
      if (command.action !== 'leave') {
        const controllerChannel = await getAuthorizedVoiceChannel(guildId, command.user_id);
        if (!controllerChannel) {
          throw new Error('Join the bot in its Discord voice channel to use player controls.');
        }
      }
      switch (command.action) {
        case 'pause':
          if (!(await musicManager.pause(guildId))) throw new Error('Nothing is currently playing.');
          break;
        case 'resume':
          if (!(await musicManager.resume(guildId))) throw new Error('Nothing is currently paused.');
          break;
        case 'skip': {
          const queue = musicManager.getQueue(guildId);
          if (!queue.current && queue.tracks.length === 0) {
            throw new Error('No tracks in queue to skip.');
          }
          await musicManager.skip(guildId);
          break;
        }
        case 'previous': {
          const queue = musicManager.getQueue(guildId);
          if (!queue.current && queue.history.length === 0) {
            throw new Error('No previous track to play.');
          }
          await musicManager.playPrevious(guildId);
          break;
        }
        case 'volume':
          if (typeof command.value !== 'number' || !(await musicManager.setVolume(guildId, command.value))) {
            throw new Error('Volume could not be changed because no player is active.');
          }
          break;
        case 'seek':
          if (typeof command.value !== 'number' || !(await musicManager.seek(guildId, command.value))) {
            throw new Error('Seek could not be applied because no track is active.');
          }
          break;
        case 'loop': {
          if (typeof command.value === 'string' && ['off', 'track', 'queue'].includes(command.value)) {
            await musicManager.setLoopMode(guildId, command.value as 'off' | 'track' | 'queue');
          } else {
            throw new Error('Invalid loop mode.');
          }
          break;
        }
        case 'shuffle': {
          await musicManager.shuffleQueue(guildId);
          break;
        }
        case 'clear': {
          await musicManager.clearQueue(guildId);
          break;
        }
        case 'stop':
          await musicManager.stop(guildId);
          break;
        case 'leave': {
          if (!isValidSignedLeaveCommand(guildId, command)) {
            console.warn(`[WebCommand] Rejected invalid signed leave command for guild ${guildId}`);
            break;
          }
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            console.log(`[WebCommand] Leaving guild ${guild.name} (${guildId}) as requested by user ${command.user_id}.`);
            await musicManager.disconnect(guildId);
            await guild.leave();
          }
          break;
        }
        case 'reload': {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) throw new Error('Discord server is unavailable.');
          const vcId = await getAuthorizedVoiceChannel(guildId, command.user_id);
          if (vcId) {
            console.log(`[WebCommand] Reloading bot in guild ${guild.name} (${guildId}) as requested by user ${command.user_id}.`);
            await musicManager.joinChannel(guildId, vcId);
            const queue = musicManager.getQueue(guildId);
            if (queue.current) {
              if (!(await musicManager.playTrack(guildId, queue.current))) {
                throw new Error('Current track could not be reloaded.');
              }
            } else {
              const next = queue.next();
              if (next && !(await musicManager.playTrack(guildId, next))) {
                throw new Error('Next track could not be started.');
              }
            }
          } else {
            throw new Error('Join a Discord voice channel before reloading the bot.');
          }
          break;
        }
        case 'remove': {
          if (Number.isInteger(command.index)) {
            if (!(await musicManager.removeQueuedTrack(guildId, command.index as number))) {
              throw new Error('Queue item no longer exists.');
            }
          } else throw new Error('Invalid queue index.');
          break;
        }
        case 'move': {
          if (Number.isInteger(command.from) && Number.isInteger(command.to)) {
            if (!(await musicManager.moveQueuedTrack(guildId, command.from as number, command.to as number))) {
              throw new Error('Queue items changed before the move completed.');
            }
          } else throw new Error('Invalid queue indexes.');
          break;
        }
        case 'jump': {
          if (Number.isInteger(command.index)) {
            if (!(await musicManager.jumpTo(guildId, command.index as number))) {
              throw new Error('Queue item no longer exists.');
            }
          } else throw new Error('Invalid queue index.');
          break;
        }
        default:
          throw new Error('Unsupported player command.');
      }
      await acknowledgeWebCommand(redis, guildId, command.request_id, { ok: true });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Player command failed.';
      console.error('[WebCommand] Error:', errorMessage);
      await acknowledgeWebCommand(redis, guildId, command.request_id, { ok: false, error: errorMessage });
    }
  });

  // Subscribe to search requests from the API
  await redis.subscribe('bot_search:request', async (message) => {
    let requestId: string | undefined;
    let resultKey: string | undefined;
    let readyKey: string | undefined;
    try {
      const { request_id, query } = JSON.parse(message) as { request_id?: string; query?: string };
      if (!request_id || !query) throw new Error('Invalid search request');
      requestId = request_id;
      resultKey = `search_result:${requestId}`;
      readyKey = `search_ready:${requestId}`;
      console.log(`[Search] Searching for: ${query}`);

      const result = await musicManager.search(query, query.startsWith('http') ? 'ytsearch' : 'ytmsearch');
      console.log(`[Search] Lavalink result loadType:`, result?.loadType);

      interface SearchTrackResult {
        encoded: string;
        title: string;
        author: string;
        url: string;
        identifier: string;
        duration: number;
        artwork_url: string;
        source: string;
      }
      const tracks: SearchTrackResult[] = [];

      if (result && result.data) {
        const rawData = result.data as unknown;

        // Build a flat array regardless of Lavalink response shape (Track, Playlist, Search)
        let trackList: Record<string, unknown>[];
        if (Array.isArray(rawData)) {
          trackList = rawData as Record<string, unknown>[];
        } else if (typeof rawData === 'object' && rawData !== null && 'tracks' in (rawData as Record<string, unknown>)) {
          trackList = (rawData as Record<string, unknown>)['tracks'] as Record<string, unknown>[];
        } else {
          trackList = [rawData as Record<string, unknown>];
        }

        for (const t of trackList.slice(0, 25)) {
          const info = t['info'] as Record<string, unknown> | undefined;
          if (info && typeof info['title'] === 'string') {
            tracks.push({
              encoded: (t['encoded'] as string) || '',
              title: info['title'] as string,
              author: (info['author'] as string) || 'Unknown',
              url: (info['uri'] as string) || (info['identifier'] as string) || '',
              identifier: (info['identifier'] as string) || '',
              duration: (info['length'] as number) || 0,
              artwork_url: (info['artworkUrl'] as string) || '',
              source: (info['sourceName'] as string) || '',
            });
          }
        }
      }

      console.log(`[Search] Extracted ${tracks.length} tracks. Saving to ${resultKey}`);
      await redis.set(resultKey, JSON.stringify({ tracks }), 30);
      // Signal the API that results are ready (enables BLPOP instead of polling)
    } catch (e) {
      console.error('[Search] Error:', e);
      if (resultKey) {
        await redis.set(resultKey, JSON.stringify({ tracks: [], error: 'Search failed' }), 30);
      }
    } finally {
      if (readyKey) {
        await redis.client.lpush(readyKey, '1');
        await redis.client.expire(readyKey, 30);
      }
    }
  });

  const webPlayOperations = new Map<string, Promise<void>>();

  const handleWebPlayRequest = async (data: WebPlayRequest): Promise<void> => {
    const { guild_id, track, tracks, action, user_discord_id } = data;
    if (!guild_id || !user_discord_id || (!track && !tracks)) {
      throw new Error('Playback request is missing its guild, requester, or tracks');
    }
    if (action !== 'play' && action !== 'queue') {
      throw new Error('Unsupported playback action');
    }

    const guild = client.guilds.cache.get(guild_id);
    if (!guild) throw new Error('The bot is not in this Discord server');
    const member = await guild.members.fetch(user_discord_id).catch(() => null);
    const voiceChannelId = member?.voice.channel?.id;
    if (!voiceChannelId) {
      throw new Error('Join a voice channel before starting playback');
    }

    // Validate and join before changing queue state. This makes a rejected voice
    // request side-effect free and prevents joining an unrelated occupied room.
    await musicManager.joinChannel(guild_id, voiceChannelId);

    const tracksToAdd = Array.isArray(tracks) ? tracks : track ? [track] : [];
    if (tracksToAdd.length === 0) throw new Error('No playable tracks were provided');
    const maxQueueSize = Number.isInteger(data.max_queue_size) && data.max_queue_size! > 0
      ? Math.min(data.max_queue_size!, 500)
      : undefined;
    const maxDurationMs = Number.isSafeInteger(data.max_song_duration_ms)
      && data.max_song_duration_ms! > 0
      ? data.max_song_duration_ms
      : undefined;
    const queueTracks: QueueTrack[] = tracksToAdd.map((item) => ({
      encoded: item.encoded,
      title: item.title || 'Unknown Track',
      author: item.author || 'Unknown Artist',
      url: item.url || item.identifier || '',
      identifier: item.identifier || '',
      duration: item.duration || 0,
      artworkUrl: item.artwork_url || item.artworkUrl,
      source: item.source || 'unknown',
      requestedBy: 'Web Panel',
      requestedById: user_discord_id,
      maxDurationMs,
    }));

    if (!(await musicManager.playWebTracks(guild_id, queueTracks, action, maxQueueSize))) {
      throw new Error('The requested tracks could not be started');
    }
  };

  await redis.subscribe('web_play:request', async (message) => {
    let data: WebPlayRequest = {};
    try {
      data = JSON.parse(message) as WebPlayRequest;
      const guildId = data.guild_id;
      if (!guildId) throw new Error('Playback request has no guild');

      const previous = webPlayOperations.get(guildId) ?? Promise.resolve();
      const operation = previous.catch(() => undefined).then(() => handleWebPlayRequest(data));
      const tail = operation.then(() => undefined, () => undefined);
      webPlayOperations.set(guildId, tail);
      void tail.then(() => {
        if (webPlayOperations.get(guildId) === tail) webPlayOperations.delete(guildId);
      });

      await operation;
      await acknowledgePlayRequest(redis, data.request_id, { ok: true });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Playback request failed';
      console.error('[WebPlay] Error:', messageText);
      await acknowledgePlayRequest(redis, data.request_id, { ok: false, error: messageText });
    }
  });

  // Login
  await client.login(config.discordToken);
}

main().catch(console.error);
