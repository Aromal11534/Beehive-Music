/**
 * Music Manager — manages per-guild players and Shoukaku integration
 */

import { Client } from 'discord.js';
import { Shoukaku, Connectors, Player, type LavalinkResponse, type NodeOption } from 'shoukaku';
import { config } from '../config';
import { QueueManager } from './QueueManager';
import { QueueTrack, GuildPlayerState } from '../types';
import { RedisService } from '../services/RedisService';

export class MusicManager {
  public shoukaku: Shoukaku;
  public queues: Map<string, QueueManager> = new Map();
  public players: Map<string, Player> = new Map();
  private client: Client;
  private redis: RedisService;
  private nodes: NodeOption[];
  private connectPromise: Promise<void> | null = null;

  constructor(client: Client, redis: RedisService) {
    this.client = client;
    this.redis = redis;

    this.nodes = [
      { name: 'serenetia', url: 'lavalinkv4.serenetia.com:443', auth: 'https://seretia.link/discord', secure: true, group: 'public' },
      { name: 'jirayu', url: 'lavalink.jirayu.net:443', auth: 'youshallnotpass', secure: true, group: 'public' },
      { name: 'millohost', url: 'lava-v4.millohost.my.id:443', auth: 'https://discord.gg/mjS5J2K3ep', secure: true, group: 'public' },
      { name: 'triniumhost', url: 'lavalink-v4.triniumhost.com:443', auth: 'free', secure: true, group: 'public' },
      { name: 'local-fallback', url: `${config.lavalink.host}:${config.lavalink.port}`, auth: config.lavalink.password, secure: false, group: 'fallback' }
    ];

    this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), [], {
      moveOnDisconnect: false,
      resume: true,
      resumeTimeout: 30,
      reconnectTries: 100,
      reconnectInterval: 5000,
      restTimeout: 60000,
      nodeResolver: (nodes) => {
        const connectedNodes = [...nodes.values()].filter(n => n.state === 1 /* CONNECTED */);
        if (connectedNodes.length === 0) return undefined;
        
        const publicNodes = connectedNodes.filter(n => n.group === 'public');
        if (publicNodes.length > 0) {
            return publicNodes.sort((a, b) => a.penalties - b.penalties)[0];
        }
        return connectedNodes.sort((a, b) => a.penalties - b.penalties)[0];
      }
    });

    this.shoukaku.on('ready', (name) => console.log(`[Lavalink] Node ${name} connected`));
    this.shoukaku.on('error', (name, error) => console.error(`[Lavalink] Node ${name} error:`, error));
    this.shoukaku.on('close', (name, code, reason) => console.warn(`[Lavalink] Node ${name} closed (${code}): ${reason}`));
    this.shoukaku.on('disconnect', (name) => console.warn(`[Lavalink] Node ${name} disconnected`));
  }

  async connectLavalink(): Promise<void> {
    if (this.shoukaku.getIdealNode()) return;

    if (!this.connectPromise) {
      this.connectPromise = this.connectLavalinkWithRetry().finally(() => {
        this.connectPromise = null;
      });
    }

    return this.connectPromise;
  }

  private async connectLavalinkWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= 30; attempt++) {
      if (this.shoukaku.getIdealNode()) return;

      const publicNodes = this.nodes.filter(n => n.group === 'public');
      for (const pNode of publicNodes) {
          if (!this.shoukaku.nodes.has(pNode.name)) {
              console.log(`[Lavalink] Adding public node ${pNode.name}`);
              this.shoukaku.addNode(pNode);
          }
      }

      if (await this.waitForConnectedNode(3000)) return;

      console.warn(`[Lavalink] Public nodes not ready; retrying or falling back (${attempt}/30)`);
      
      if (attempt > 1) {
          const fallbackNode = this.nodes.find(n => n.group === 'fallback')!;
          if (!this.shoukaku.nodes.has(fallbackNode.name) && await this.isLavalinkHttpReady(fallbackNode)) {
              console.log(`[Lavalink] Adding fallback node ${fallbackNode.name}`);
              this.shoukaku.addNode(fallbackNode);
          }
      }

      await this.sleep(2000);
    }

    throw new Error('Lavalink nodes did not become available');
  }

  private async isLavalinkHttpReady(node: NodeOption): Promise<boolean> {
    try {
      const scheme = node.secure ? 'https' : 'http';
      const response = await fetch(`${scheme}://${node.url}/version`, {
        headers: { Authorization: node.auth },
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async waitForConnectedNode(timeoutMs: number): Promise<boolean> {
    if (this.shoukaku.getIdealNode()) return true;

    return new Promise((resolve) => {
      const cleanup = (connected: boolean) => {
        clearTimeout(timeout);
        this.shoukaku.off('ready', onReady);
        resolve(connected);
      };
      const onReady = () => cleanup(true);
      const timeout = setTimeout(() => cleanup(!!this.shoukaku.getIdealNode()), timeoutMs);

      this.shoukaku.once('ready', onReady);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getQueue(guildId: string): QueueManager {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, new QueueManager());
    }
    return this.queues.get(guildId)!;
  }

  async joinChannel(guildId: string, channelId: string): Promise<Player> {
    let player = this.players.get(guildId);
    if (player) return player;

    await this.connectLavalink();

    const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
    if (!node) throw new Error('No Lavalink nodes available');

    player = await this.shoukaku.joinVoiceChannel({
      guildId,
      channelId,
      shardId: 0,
      deaf: true,
    });

    this.players.set(guildId, player);

    // Set up event handlers
    player.on('end', async (data) => {
      if (data.reason === 'replaced') return;
      const queue = this.getQueue(guildId);
      const nextTrack = queue.next();
      if (nextTrack) {
        await this.playTrack(guildId, nextTrack);
      } else {
        await this.publishState(guildId);
      }
    });

    player.on('stuck', async () => {
      console.warn(`[Player] Track stuck in guild ${guildId}`);
      const queue = this.getQueue(guildId);
      const nextTrack = queue.next();
      if (nextTrack) {
        await this.playTrack(guildId, nextTrack);
      }
    });

    player.on('exception', (error) => {
      console.error(`[Player] Exception in guild ${guildId}:`, error);
    });

    return player;
  }

  async search(query: string, source: string = 'ytsearch'): Promise<LavalinkResponse | undefined> {
    await this.connectLavalink();

    const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
    if (!node) throw new Error('No Lavalink nodes available');

    let searchQuery = query;
    if (!query.startsWith('http') && !query.includes(':')) {
      searchQuery = `${source}:${query}`;
    }

    return node.rest.resolve(searchQuery);
  }

  async playTrack(guildId: string, track: QueueTrack): Promise<void> {
    const player = this.players.get(guildId);
    if (!player) return;

    const queue = this.getQueue(guildId);
    queue.current = track;

    try {
      const payload = {
        guild_discord_id: guildId,
        track_title: track.title,
        track_author: track.author,
        track_url: track.url || track.identifier,
        track_identifier: track.identifier,
        source: track.source,
        duration_ms: track.duration,
        requested_by_discord_id: (track as any).requestedById || null
      };
      console.log(`[MusicManager] Publishing track_start:`, payload);
      await this.redis.publish("bot_event:track_start", JSON.stringify(payload));
    } catch (e) {
      console.error("[Redis] Failed to publish track_start event:", e);
    }

    if (track.encoded) {
      await player.playTrack({ track: { encoded: track.encoded } });
      await this.publishState(guildId);
      return;
    }

    await this.connectLavalink();

    const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
    if (!node) return;

    const result = await node.rest.resolve(track.url);
    const resolvedTrack = Array.isArray(result?.data) ? result.data[0] : result?.data;

    if (resolvedTrack && 'encoded' in resolvedTrack && typeof resolvedTrack.encoded === 'string') {
      await player.playTrack({ track: { encoded: resolvedTrack.encoded } });
      await this.publishState(guildId);
    }
  }

  async stop(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (player) {
      await player.stopTrack();
    }
    const queue = this.getQueue(guildId);
    queue.clear();
    queue.current = null;
    await this.publishState(guildId);
  }

  async disconnect(guildId: string): Promise<void> {
    await this.stop(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
    this.players.delete(guildId);
    this.queues.delete(guildId);
  }

  async setVolume(guildId: string, volume: number): Promise<void> {
    const player = this.players.get(guildId);
    if (player) {
      await player.setGlobalVolume(volume);
      const queue = this.getQueue(guildId);
      queue.volume = volume;
      await this.publishState(guildId);
    }
  }

  async seek(guildId: string, positionMs: number): Promise<void> {
    const player = this.players.get(guildId);
    if (player) {
      await player.seekTo(positionMs);
      await this.publishState(guildId);
    }
  }

  async pause(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (player) {
      await player.setPaused(true);
      await this.publishState(guildId);
    }
  }

  async resume(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (player) {
      await player.setPaused(false);
      await this.publishState(guildId);
    }
  }

  getState(guildId: string): GuildPlayerState {
    const queue = this.getQueue(guildId);
    const player = this.players.get(guildId);

    return {
      guildId,
      isPlaying: player ? !player.paused && queue.current !== null : false,
      isPaused: player?.paused || false,
      currentTrack: queue.current,
      positionMs: player?.position || 0,
      volume: queue.volume,
      loopMode: queue.loopMode,
      queue: queue.tracks,
    };
  }

  async publishState(guildId: string): Promise<void> {
    const state = this.getState(guildId);
    try {
      await this.redis.publish(`player:${guildId}`, JSON.stringify(state));
      await this.redis.set(`player_state:${guildId}`, JSON.stringify(state), 3600);
    } catch (e) {
      console.error('[Redis] Failed to publish state:', e);
    }
  }
}
