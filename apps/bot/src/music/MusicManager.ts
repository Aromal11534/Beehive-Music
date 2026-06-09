/**
 * Music Manager — manages per-guild players and Shoukaku integration
 */

import { Client } from 'discord.js';
import { Shoukaku, Connectors, Player, LoadType, type LavalinkResponse, type Node, type NodeOption, type Track } from 'shoukaku';
import { config } from '../config';
import { QueueManager, QueueSnapshot } from './QueueManager';
import { QueueTrack, GuildPlayerState } from '../types';
import { RedisService } from '../services/RedisService';

const QUEUE_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;

export class MusicManager {
  public shoukaku: Shoukaku;
  public queues: Map<string, QueueManager> = new Map();
  private client: Client;
  private redis: RedisService;
  private nodes: NodeOption[];
  private connectPromise: Promise<void> | null = null;

  constructor(client: Client, redis: RedisService) {
    this.client = client;
    this.redis = redis;

    this.nodes = [
      { name: 'local', url: `${config.lavalink.host}:${config.lavalink.port}`, auth: config.lavalink.password, secure: false, group: 'primary' },
      { name: 'serenetia', url: 'lavalinkv4.serenetia.com:443', auth: 'https://seretia.link/discord', secure: true, group: 'public' },
      { name: 'jirayu', url: 'lavalink.jirayu.net:443', auth: 'youshallnotpass', secure: true, group: 'public' },
      { name: 'millohost', url: 'lava-v4.millohost.my.id:443', auth: 'https://discord.gg/mjS5J2K3ep', secure: true, group: 'public' }
    ];

    this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), [], {
      moveOnDisconnect: false,
      resume: true,
      resumeTimeout: 30,
      reconnectTries: 100,
      reconnectInterval: 5000,
      restTimeout: 60000,
      nodeResolver: (nodes) => this.getConnectedNodes(nodes)[0]
    });

    this.shoukaku.on('ready', (name) => console.log(`[Lavalink] Node ${name} connected`));
    this.shoukaku.on('error', (name, error) => console.error(`[Lavalink] Node ${name} error:`, error));
    this.shoukaku.on('close', (name, code, reason) => console.warn(`[Lavalink] Node ${name} closed (${code}): ${reason}`));
    this.shoukaku.on('disconnect', (name) => console.warn(`[Lavalink] Node ${name} disconnected`));
  }

  async connectLavalink(): Promise<void> {
    this.addMissingLavalinkNodes();
    if (this.getConnectedNodes().length > 0) return;

    if (!this.connectPromise) {
      this.connectPromise = this.connectLavalinkWithRetry().finally(() => {
        this.connectPromise = null;
      });
    }

    return this.connectPromise;
  }

  private async connectLavalinkWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= 30; attempt++) {
      this.addMissingLavalinkNodes();

      if (await this.waitForConnectedNode(3000)) return;

      console.warn(`[Lavalink] Nodes not ready; retrying (${attempt}/30)`);

      await this.sleep(2000);
    }

    throw new Error('Lavalink nodes did not become available');
  }

  private addMissingLavalinkNodes(): void {
    for (const node of this.nodes) {
      if (!this.shoukaku.nodes.has(node.name)) {
        console.log(`[Lavalink] Adding node ${node.name} (${node.group ?? 'default'})`);
        this.shoukaku.addNode(node);
      }
    }
  }

  private getConnectedNodes(nodes = this.shoukaku.nodes): Node[] {
    return [...nodes.values()]
      .filter((node) => node.state === 1 /* CONNECTED */)
      .sort((a, b) => {
        if (a.group === 'primary' && b.group !== 'primary') return -1;
        if (b.group === 'primary' && a.group !== 'primary') return 1;
        return a.penalties - b.penalties;
      });
  }

  private async resolveWithFallback(identifier: string): Promise<LavalinkResponse | undefined> {
    await this.connectLavalink();

    const nodes = this.getConnectedNodes();
    if (nodes.length === 0) throw new Error('No Lavalink nodes available');

    for (const node of nodes) {
      try {
        const result = await node.rest.resolve(identifier);
        if (result && result.loadType !== LoadType.EMPTY && result.loadType !== LoadType.ERROR) {
          return result;
        }

        console.warn(`[Lavalink] Node ${node.name} returned ${result?.loadType ?? 'no result'} for ${identifier}; trying next node`);
      } catch (error) {
        console.warn(`[Lavalink] Node ${node.name} failed to resolve ${identifier}; trying next node`, error);
      }
    }

    return undefined;
  }

  private getFirstResolvedTrack(result: LavalinkResponse | undefined): Track | null {
    if (!result) return null;
    if (result.loadType === LoadType.TRACK) return result.data;
    if (result.loadType === LoadType.SEARCH) return result.data[0] ?? null;
    if (result.loadType === LoadType.PLAYLIST) return result.data.tracks[0] ?? null;
    return null;
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

  private getQueueStateKey(guildId: string): string {
    return `queue:${guildId}`;
  }

  private isQueueSnapshot(value: unknown): value is QueueSnapshot {
    if (!value || typeof value !== 'object') return false;
    const snapshot = value as Partial<QueueSnapshot>;
    return snapshot.version === 1
      && Array.isArray(snapshot.tracks)
      && Array.isArray(snapshot.history)
      && (snapshot.current === null || typeof snapshot.current === 'object')
      && ['off', 'track', 'queue'].includes(snapshot.loopMode as string)
      && typeof snapshot.volume === 'number';
  }

  async restoreQueues(guildIds: Iterable<string>): Promise<void> {
    for (const guildId of guildIds) {
      try {
        const cached = await this.redis.get(this.getQueueStateKey(guildId));
        if (!cached) continue;

        const snapshot = JSON.parse(cached) as unknown;
        if (!this.isQueueSnapshot(snapshot)) {
          console.warn(`[Queue] Ignoring invalid cached queue for guild ${guildId}`);
          continue;
        }

        const queue = QueueManager.fromSnapshot(snapshot);
        this.queues.set(guildId, queue);
        await this.publishState(guildId);
        console.log(`[Queue] Restored ${queue.length} queued track(s) for guild ${guildId}`);
      } catch (error) {
        console.error(`[Queue] Failed to restore queue for guild ${guildId}:`, error);
      }
    }
  }

  private async persistQueue(guildId: string): Promise<void> {
    const queue = this.getQueue(guildId);
    if (!queue.current && queue.tracks.length === 0 && queue.history.length === 0) {
      await this.redis.del(this.getQueueStateKey(guildId));
      return;
    }

    await this.redis.set(
      this.getQueueStateKey(guildId),
      JSON.stringify(queue.toSnapshot()),
      QUEUE_STATE_TTL_SECONDS
    );
  }

  async joinChannel(guildId: string, channelId: string): Promise<Player> {
    let player = this.shoukaku.players.get(guildId);
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

  async search(query: string, source: string = 'ytmsearch'): Promise<LavalinkResponse | undefined> {
    await this.connectLavalink();

    let searchQuery = query;
    if (!query.startsWith('http') && !query.includes(':')) {
      searchQuery = `${source}:${query}`;
    }

    return this.resolveWithFallback(searchQuery);
  }

  async playTrack(guildId: string, track: QueueTrack): Promise<void> {
    const queue = this.getQueue(guildId);
    queue.current = track;

    const player = this.shoukaku.players.get(guildId);
    if (!player) {
      // If there's no player, we can't play the track.
      // Revert the current track to be the first in queue so it's not lost.
      if (queue.current === track) {
        queue.current = null;
        queue.addNext(track);
      }
      await this.publishState(guildId);
      return;
    }

    try {
      const payload = {
        guild_discord_id: guildId,
        track_title: track.title,
        track_author: track.author,
        track_url: track.url || track.identifier,
        track_identifier: track.identifier,
        source: track.source,
        duration_ms: track.duration,
        requested_by_discord_id: track.requestedById || null
      };
      console.log(`[MusicManager] Publishing track_start:`, payload);
      await this.redis.publish("bot_event:track_start", JSON.stringify(payload));
    } catch (e) {
      console.error("[Redis] Failed to publish track_start event:", e);
    }

    if (track.encoded) {
      await player.setPaused(false);
      await player.playTrack({ track: { encoded: track.encoded } });
      await this.publishState(guildId);
      return;
    }

    await this.connectLavalink();

    let resolveUrl = track.url;
    if (track.source === 'spotify' || (resolveUrl && resolveUrl.includes('spotify.com'))) {
      resolveUrl = `ytmsearch:${track.title} ${track.author}`;
    }

    const result = await this.resolveWithFallback(resolveUrl);
    const resolvedTrack = this.getFirstResolvedTrack(result);

    if (resolvedTrack && 'encoded' in resolvedTrack && typeof resolvedTrack.encoded === 'string') {
      await player.setPaused(false);
      await player.playTrack({ track: { encoded: resolvedTrack.encoded } });
      await this.publishState(guildId);
    }
  }

  async stop(guildId: string): Promise<void> {
    const player = this.shoukaku.players.get(guildId);
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
    this.queues.delete(guildId);
  }

  async setVolume(guildId: string, volume: number): Promise<void> {
    const player = this.shoukaku.players.get(guildId);
    if (player) {
      await player.setGlobalVolume(volume);
      const queue = this.getQueue(guildId);
      queue.volume = volume;
      await this.publishState(guildId);
    }
  }

  async seek(guildId: string, positionMs: number): Promise<void> {
    const player = this.shoukaku.players.get(guildId);
    if (player) {
      await player.seekTo(positionMs);
      await this.publishState(guildId);
    }
  }

  async pause(guildId: string): Promise<void> {
    const player = this.shoukaku.players.get(guildId);
    if (player) {
      await player.setPaused(true);
      await this.publishState(guildId);
    }
  }

  async resume(guildId: string): Promise<void> {
    const player = this.shoukaku.players.get(guildId);
    if (player) {
      await player.setPaused(false);
      await this.publishState(guildId);
    }
  }

  getState(guildId: string): GuildPlayerState {
    const queue = this.getQueue(guildId);
    const player = this.shoukaku.players.get(guildId);

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
      await this.persistQueue(guildId);
      await this.redis.publish(`player:${guildId}`, JSON.stringify(state));
      await this.redis.set(`player_state:${guildId}`, JSON.stringify(state), 3600);
    } catch (e) {
      console.error('[Redis] Failed to publish state:', e);
    }
  }
}
