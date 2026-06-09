/**
 * Beehive Bot — Main entry point
 */

import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
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
  guild_id?: string;
  track?: WebPlayableTrack;
  tracks?: WebPlayableTrack[];
  action?: string;
  user_discord_id?: string;
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

  // Subscribe to web commands from Redis
  redis.psubscribe('web_command:*', async (channel, message) => {
    console.log(`[Redis] Received on ${channel}: ${message}`);
    const guildId = channel.split(':')[1];
    if (!guildId) return;

    try {
      const command = JSON.parse(message);
      switch (command.action) {
        case 'pause':
          await musicManager.pause(guildId);
          break;
        case 'resume':
          await musicManager.resume(guildId);
          break;
        case 'skip': {
          const q = musicManager.getQueue(guildId);
          const next = q.next();
          if (next) await musicManager.playTrack(guildId, next);
          else await musicManager.stop(guildId);
          break;
        }
        case 'previous': {
          const q = musicManager.getQueue(guildId);
          const prev = q.previous();
          if (prev) await musicManager.playTrack(guildId, prev);
          break;
        }
        case 'volume':
          if (command.value !== undefined) await musicManager.setVolume(guildId, command.value);
          break;
        case 'seek':
          if (command.value !== undefined) await musicManager.seek(guildId, command.value);
          break;
        case 'loop': {
          const q = musicManager.getQueue(guildId);
          if (command.value && ['off', 'track', 'queue'].includes(command.value)) {
            q.loopMode = command.value;
          }
          await musicManager.publishState(guildId);
          break;
        }
        case 'shuffle': {
          const q = musicManager.getQueue(guildId);
          q.shuffle();
          await musicManager.publishState(guildId);
          break;
        }
        case 'clear': {
          const q = musicManager.getQueue(guildId);
          q.clear();
          await musicManager.publishState(guildId);
          break;
        }
        case 'stop':
          await musicManager.stop(guildId);
          break;
        case 'leave': {
          // Verify the command includes a valid user before leaving
          if (!command.user_id) {
            console.warn(`[WebCommand] Leave rejected: no user_id provided for guild ${guildId}`);
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
          if (!command.user_id) {
            console.warn(`[WebCommand] Reload rejected: no user_id provided for guild ${guildId}`);
            break;
          }
          const guild = client.guilds.cache.get(guildId);
          if (!guild) break;
          const member = await guild.members.fetch(command.user_id).catch(() => null);
          const vcId = member?.voice?.channel?.id;
          if (vcId) {
            console.log(`[WebCommand] Reloading bot in guild ${guild.name} (${guildId}) as requested by user ${command.user_id}.`);
            await musicManager.joinChannel(guildId, vcId);
            const queue = musicManager.getQueue(guildId);
            if (queue.current) {
              await musicManager.playTrack(guildId, queue.current);
            } else {
              const next = queue.next();
              if (next) await musicManager.playTrack(guildId, next);
            }
          } else {
            console.warn(`[WebCommand] Reload aborted: user ${command.user_id} is not in a voice channel in guild ${guildId}`);
          }
          break;
        }
        case 'remove': {
          const q = musicManager.getQueue(guildId);
          if (Number.isInteger(command.index)) {
            const removed = q.remove(command.index);
            if (!removed) break;
            await musicManager.publishState(guildId);
          }
          break;
        }
        case 'move': {
          const q = musicManager.getQueue(guildId);
          if (Number.isInteger(command.from) && Number.isInteger(command.to)) {
            const moved = q.move(command.from, command.to);
            if (!moved) break;
            await musicManager.publishState(guildId);
          }
          break;
        }
        case 'jump': {
          const q = musicManager.getQueue(guildId);
          if (Number.isInteger(command.index)) {
            const track = q.jump(command.index);
            if (track) await musicManager.playTrack(guildId, track);
          }
          break;
        }
      }
    } catch (e) {
      console.error('[WebCommand] Error:', e);
    }
  });

  // Subscribe to search requests from the API
  redis.subscribe('bot_search:request', async (message) => {
    try {
      console.log('[Search] Received raw message:', message);
      const { request_id, query } = JSON.parse(message) as { request_id: string; query: string };
      const resultKey = `search_result:${request_id}`;
      const readyKey = `search_ready:${request_id}`;
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
      await redis.client.lpush(readyKey, '1');
      await redis.client.expire(readyKey, 30);
    } catch (e) {
      console.error('[Search] Error:', e);
    }
  });

  redis.subscribe('web_play:request', async (message) => {
    try {
      console.log(`[WebPlay] Received play request`);
      const data = JSON.parse(message) as WebPlayRequest;
      const { guild_id, track, tracks, action, user_discord_id } = data;
      if (!guild_id || (!track && !tracks)) {
        console.error('[WebPlay] Missing guild_id or track(s)');
        return;
      }

      const queue = musicManager.getQueue(guild_id);

      const tracksToAdd = Array.isArray(tracks) ? tracks : track ? [track] : [];
      if (tracksToAdd.length === 0) return;

      const queueTracks: QueueTrack[] = tracksToAdd.map((t) => ({
        encoded: t.encoded,
        title: t.title || 'Unknown Track',
        author: t.author || 'Unknown Artist',
        url: t.url || t.identifier || '',
        identifier: t.identifier || t.url || '',
        duration: t.duration || 0,
        artworkUrl: t.artwork_url || t.artworkUrl,
        source: t.source || 'unknown',
        requestedBy: 'Web Panel',
        requestedById: user_discord_id,
      }));

      if (action === 'queue') {
        queue.addMany(queueTracks);
        const state = musicManager.getState(guild_id);

        // If the bot isn't playing anything, auto-start playback
        if (!state.currentTrack && !state.isPlaying) {
          const first = queue.next();
          if (first) {
            const guild = client.guilds.cache.get(guild_id);
            let vcId: string | undefined;

            if (guild) {
              if (user_discord_id) {
                try {
                  const member = await guild.members.fetch(user_discord_id).catch(() => null);
                  if (member?.voice.channel) {
                    vcId = member.voice.channel.id;
                  }
                } catch { }
              }
              if (!vcId) {
                const vc = guild.channels.cache.find((ch) => ch.isVoiceBased() && ch.members.size > 0);
                if (vc) vcId = vc.id;
              }
            }

            if (vcId) {
              await musicManager.joinChannel(guild_id, vcId);
              queue.current = first;
              await musicManager.playTrack(guild_id, first);
            } else {
              queue.addNext(first); // put it back
              console.warn(`[WebPlay] Auto-start aborted: Could not find a suitable voice channel in guild ${guild_id}`);
              await musicManager.publishState(guild_id);
            }
          } else {
            await musicManager.publishState(guild_id);
          }
        } else {
          await musicManager.publishState(guild_id);
        }
      } else {
        // Play now
        queue.clear();
        const first = queueTracks.shift();
        if (queueTracks.length > 0) {
          queue.addMany(queueTracks);
        }

        if (first) {
          const guild = client.guilds.cache.get(guild_id);
          let vcId: string | undefined;

          if (guild) {
            // Priority 1: Try to find the user's voice channel
            if (user_discord_id) {
              try {
                const member = await guild.members.fetch(user_discord_id).catch(() => null);
                if (member?.voice.channel) {
                  vcId = member.voice.channel.id;
                }
              } catch {
                // Ignore fetch errors
              }
            }

            // Priority 2: Fallback to the first voice channel with users
            if (!vcId) {
              const vc = guild.channels.cache.find(
                (ch) => ch.isVoiceBased() && ch.members.size > 0
              );
              if (vc) vcId = vc.id;
            }
          }

          if (vcId) {
            await musicManager.joinChannel(guild_id, vcId);
            queue.current = first;
            await musicManager.playTrack(guild_id, first);
          } else {
            console.warn(`[WebPlay] Aborted: Could not find a suitable voice channel to join in guild ${guild_id}`);
            // Explicitly publish state so web UI doesn't get stuck thinking it's loading
            await musicManager.publishState(guild_id);
          }
        }
      }
    } catch (e) {
      console.error('[WebPlay] Error:', e);
    }
  });

  // Login
  await client.login(config.discordToken);
}

main().catch(console.error);
