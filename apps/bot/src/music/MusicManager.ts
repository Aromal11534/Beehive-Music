/**
 * Music Manager — manages per-guild players and Shoukaku integration
 */

import { Client } from 'discord.js';
import { Shoukaku, Connectors, Player, LoadType, type LavalinkResponse, type Node, type NodeOption, type Track, type TrackEndEvent } from 'shoukaku';
import { config } from '../config';
import { QueueManager, QueueSnapshot } from './QueueManager';
import { QueueTrack, GuildPlayerState } from '../types';
import { RedisService } from '../services/RedisService';

const QUEUE_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_CONSECUTIVE_PLAYBACK_FAILURES = 3;

class PlaybackPolicyError extends Error {}

interface PlaybackAttempt {
  track: QueueTrack;
  generation: number;
  triedNodes: Set<string>;
  handledFailures: Set<string>;
  triedEncodings: Set<string>;
  pendingFailures: Array<{ nodeName: string; encoded?: string; reason?: string }>;
  encoded?: string;
  recovering: boolean;
  announced: boolean;
}

export class MusicManager {
  public shoukaku: Shoukaku;
  public queues: Map<string, QueueManager> = new Map();
  private client: Client;
  private redis: RedisService;
  private nodes: NodeOption[];
  private connectPromise: Promise<void> | null = null;
  private nodeReconnectTimers = new Map<string, NodeJS.Timeout>();
  private playbackAttempts = new Map<string, PlaybackAttempt>();
  private consecutivePlaybackFailures = new Map<string, number>();
  private playbackGenerations = new Map<string, number>();
  private guildOperations = new Map<string, Promise<void>>();
  private youtubeBlockedUntil: number = 0;

  public isYouTubeBlocked(): boolean {
    return Date.now() < this.youtubeBlockedUntil;
  }

  public markYouTubeBlocked(reason?: string): void {
    const durationMs = 15 * 60 * 1000; // 15 minutes
    this.youtubeBlockedUntil = Date.now() + durationMs;
    console.warn(`[Player] YouTube marked as blocked for next 15 minutes (${reason ?? 'bot mitigations'})`);
  }

  constructor(client: Client, redis: RedisService) {
    this.client = client;
    this.redis = redis;

    this.nodes = [
      { name: 'local', url: `${config.lavalink.host}:${config.lavalink.port}`, auth: config.lavalink.password, secure: false, group: 'primary' }
    ];

    this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), [], {
      moveOnDisconnect: true,
      resume: true,
      resumeTimeout: 30,
      reconnectTries: 10,
      // Shoukaku expects seconds here (it multiplies this value by 1000).
      reconnectInterval: 5,
      restTimeout: 10,
      nodeResolver: (nodes) => this.getConnectedNodes(nodes)[0]
    });

    this.shoukaku.on('ready', (name) => {
      this.clearNodeReconnectTimer(name);
      console.log(`[Lavalink] Node ${name} connected`);
    });
    this.shoukaku.on('error', (name, error) => console.error(`[Lavalink] Node ${name} error:`, error));
    this.shoukaku.on('close', (name, code, reason) => console.warn(`[Lavalink] Node ${name} closed (${code}): ${reason}`));
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
    for (let attempt = 1; attempt <= 3; attempt++) {
      this.addMissingLavalinkNodes();

      if (await this.waitForConnectedNode(3000)) return;

      console.warn(`[Lavalink] Nodes not ready; retrying (${attempt}/3)`);

      await this.sleep(2000);
    }

    throw new Error('Lavalink nodes did not become available');
  }

  private addMissingLavalinkNodes(): void {
    for (const node of this.nodes) {
      if (!this.shoukaku.nodes.has(node.name)) {
        console.log(`[Lavalink] Adding node ${node.name} (${node.group ?? 'default'})`);
        this.addLavalinkNode(node);
      }
    }
  }

  private addLavalinkNode(options: NodeOption): void {
    this.shoukaku.addNode(options);
    // Shoukaku removes failed nodes from its map but does not forward the
    // Node-level disconnect event through the manager in v4.3.0.
    this.shoukaku.nodes.get(options.name)?.once('disconnect', () => {
      console.warn(`[Lavalink] Node ${options.name} disconnected`);
      this.scheduleNodeReconnect(options.name);
    });
  }

  private clearNodeReconnectTimer(name: string): void {
    const timer = this.nodeReconnectTimers.get(name);
    if (!timer) return;
    clearTimeout(timer);
    this.nodeReconnectTimers.delete(name);
  }

  private scheduleNodeReconnect(name: string): void {
    if (this.nodeReconnectTimers.has(name)) return;
    const options = this.nodes.find((node) => node.name === name);
    if (!options) return;

    const timer = setTimeout(() => {
      this.nodeReconnectTimers.delete(name);
      const existing = this.shoukaku.nodes.get(name);
      if (existing?.state === 1 || existing?.state === 0) return;

      if (existing) this.shoukaku.removeNode(name, 'Recreating disconnected node');
      console.log(`[Lavalink] Re-adding disconnected node ${name}`);
      this.addLavalinkNode(options);
    }, 5000);

    this.nodeReconnectTimers.set(name, timer);
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

  private getBestResolvedTrack(result: LavalinkResponse | undefined): Track | null {
    if (!result) return null;
    if (result.loadType === LoadType.TRACK) return result.data;
    let tracks: Track[] = [];
    if (result.loadType === LoadType.SEARCH) tracks = result.data;
    else if (result.loadType === LoadType.PLAYLIST) tracks = result.data.tracks;
    if (tracks.length === 0) return null;

    const sorted = [...tracks].sort((a, b) => {
      const aTopic = (a?.info?.author || '').toLowerCase().includes('topic') ? 1 : 0;
      const bTopic = (b?.info?.author || '').toLowerCase().includes('topic') ? 1 : 0;
      return bTopic - aTopic;
    });
    return sorted[0] ?? null;
  }

  private isYouTubeOrSpotify(track: QueueTrack): boolean {
    const url = track.url || track.identifier || '';
    return (
      track.source === 'youtube' ||
      track.source === 'spotify' ||
      url.includes('youtube.com') ||
      url.includes('youtu.be') ||
      url.includes('spotify.com')
    );
  }

  private async resolveTrackOnNode(node: Node, track: QueueTrack): Promise<string | null> {
    const cleanTitle = (track.title || '').trim();
    const cleanAuthor = (
      track.author && track.author !== 'Unknown' && track.author !== 'Unknown Artist'
        ? track.author
        : ''
    ).trim();

    const isYtOrSpotify = this.isYouTubeOrSpotify(track);
    const ytBlocked = this.isYouTubeBlocked();

    // Build candidate identifiers to try in order of preference.
    const candidateIdentifiers: string[] = [];

    // If YouTube is currently blocked on the server, prioritize SoundCloud immediately
    // so track doesn't lag or fail on Google bot-checks!
    if (ytBlocked && cleanTitle && cleanTitle !== 'Unknown Track') {
      candidateIdentifiers.push(`scsearch:${cleanTitle} ${cleanAuthor}`.trim());
      if (cleanAuthor) candidateIdentifiers.push(`scsearch:${cleanTitle}`);
    }

    // For YouTube and Spotify tracks (when YouTube is healthy):
    // YouTube Music (ytmsearch) tracks stream reliably via the MUSIC / WEB_REMIX client.
    if (isYtOrSpotify && cleanTitle && cleanTitle !== 'Unknown Track' && !ytBlocked) {
      candidateIdentifiers.push(`ytmsearch:${cleanTitle} ${cleanAuthor}`.trim());
      if (cleanAuthor) {
        candidateIdentifiers.push(`ytmsearch:${cleanTitle}`);
      }
    }

    const directIdentifier = track.url || track.identifier;
    if (directIdentifier && !isYtOrSpotify) {
      // For Soundcloud, Bandcamp, Twitch, Vimeo, etc. direct URL is primary
      candidateIdentifiers.unshift(directIdentifier);
    } else if (directIdentifier && !ytBlocked) {
      // For YouTube, direct URL is a fallback if ytmsearch finds nothing
      candidateIdentifiers.push(directIdentifier);
    }

    // Generic fallbacks
    if (cleanTitle && cleanTitle !== 'Unknown Track') {
      if (!candidateIdentifiers.some((c) => c.startsWith('scsearch:'))) {
        candidateIdentifiers.push(`scsearch:${cleanTitle} ${cleanAuthor}`.trim());
      }
      if (!ytBlocked) {
        candidateIdentifiers.push(`ytsearch:${cleanTitle} ${cleanAuthor}`.trim());
      }
    }

    for (const identifier of candidateIdentifiers) {
      try {
        const result = await node.rest.resolve(identifier);
        const resolvedTrack = this.getBestResolvedTrack(result);

        if (resolvedTrack?.encoded) {
          const actualDuration = resolvedTrack.info.length ?? 0;
          if (
            track.maxDurationMs &&
            (resolvedTrack.info.isStream || actualDuration > track.maxDurationMs)
          ) {
            throw new PlaybackPolicyError(
              `Track exceeds this server's ${Math.floor(track.maxDurationMs / 1000)} second duration limit`
            );
          }

          // Persist Lavalink's trusted metadata instead of caller-supplied values.
          track.encoded = resolvedTrack.encoded;
          track.title = resolvedTrack.info.title || track.title;
          track.author = resolvedTrack.info.author || track.author;
          track.url = resolvedTrack.info.uri || track.url;
          track.identifier = resolvedTrack.info.identifier || track.identifier;
          track.duration = actualDuration;
          track.artworkUrl = resolvedTrack.info.artworkUrl || track.artworkUrl;
          track.source = resolvedTrack.info.sourceName || track.source;
          return resolvedTrack.encoded;
        }

        console.warn(`[Player] Node ${node.name} query "${identifier}" returned no tracks; trying next candidate`);
      } catch (error) {
        if (error instanceof PlaybackPolicyError) throw error;
        console.warn(`[Player] Node ${node.name} failed to resolve query "${identifier}":`, error);
      }
    }

    // Encoded tracks are useful for sources that do not expose a resolvable URI.
    return track.encoded ?? null;
  }

  private getPlaybackNodes(player: Player, excludedNodes: Set<string> = new Set()): Node[] {
    const connectedNodes = this.getConnectedNodes()
      .filter((node) => !excludedNodes.has(node.name));
    const currentNode = connectedNodes.find((node) => node.name === player.node.name);

    return currentNode
      ? [currentNode, ...connectedNodes.filter((node) => node.name !== currentNode.name)]
      : connectedNodes;
  }

  private async migrateDisconnectedPlayer(
    guildId: string,
    player: Player,
    targetNode: Node
  ): Promise<boolean> {
    const connection = this.shoukaku.connections.get(guildId);
    if (!connection?.serverUpdate || !connection.sessionId || !connection.channelId) {
      console.warn(`[Player] Cannot migrate guild ${guildId}: voice connection is not ready`);
      return false;
    }

    try {
      player.track = null;
      player.position = 0;
      player.node = targetNode;
      await player.sendServerUpdate(connection);
      await player.setGlobalVolume(this.getQueue(guildId).volume);
      console.log(`[Player] Migrated guild ${guildId} to node ${targetNode.name}`);
      return true;
    } catch (error) {
      console.warn(`[Player] Failed to migrate guild ${guildId} to node ${targetNode.name}:`, error);
      return false;
    }
  }

  private async startTrackOnAvailableNode(
    guildId: string,
    player: Player,
    attempt: PlaybackAttempt,
    nodes: Node[]
  ): Promise<boolean> {
    for (const node of nodes) {
      if (!this.isCurrentAttempt(guildId, attempt)) return false;
      attempt.triedNodes.add(node.name);
      const encoded = await this.resolveTrackOnNode(node, attempt.track);
      if (!this.isCurrentAttempt(guildId, attempt)) return false;
      if (!encoded) continue;

      try {
        if (player.node.name !== node.name) {
          let moved: boolean;
          if (player.node.state !== 1 || !this.shoukaku.nodes.has(player.node.name)) {
            moved = await this.migrateDisconnectedPlayer(guildId, player, node);
          } else {
            // Do not let Shoukaku resume the failed encoding while moving. The
            // freshly resolved encoding is sent immediately after the move.
            player.track = null;
            moved = await player.move(node.name);
          }
          if (!this.isCurrentAttempt(guildId, attempt)) return false;
          if (!moved && player.node.name !== node.name) {
            console.warn(`[Player] Could not move guild ${guildId} to node ${node.name}`);
            continue;
          }
        }

        attempt.encoded = encoded;
        await player.playTrack({
          track: { encoded },
          paused: false,
          volume: this.getQueue(guildId).volume,
        });
        if (!this.isCurrentAttempt(guildId, attempt)) return false;
        console.log(`[Player] Sent ${attempt.track.title} to node ${node.name} in guild ${guildId}`);
        await this.publishState(guildId);
        return true;
      } catch (error) {
        console.warn(`[Player] Node ${node.name} rejected ${attempt.track.title}:`, error);
      }
    }

    return false;
  }

  private async publishTrackStart(guildId: string, track: QueueTrack): Promise<void> {
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
      console.log('[MusicManager] Publishing track_start:', payload);
      await this.redis.publish('bot_event:track_start', JSON.stringify(payload));
    } catch (error) {
      console.error('[Redis] Failed to publish track_start event:', error);
    }
  }

  private async advanceAfterPlaybackFailure(guildId: string, attempt: PlaybackAttempt): Promise<boolean> {
    if (!this.isCurrentAttempt(guildId, attempt)) return false;

    this.playbackAttempts.delete(guildId);
    const failures = (this.consecutivePlaybackFailures.get(guildId) ?? 0) + 1;
    this.consecutivePlaybackFailures.set(guildId, failures);

    const queue = this.getQueue(guildId);
    const player = this.shoukaku.players.get(guildId);
    if (player) {
      try {
        await player.stopTrack();
      } catch (error) {
        console.warn(`[Player] Could not stop failed playback in guild ${guildId}:`, error);
      } finally {
        player.track = null;
        player.position = 0;
      }
    }
    queue.current = null;

    if (failures >= 10) {
      console.error(
        `[Player] Pausing queue in guild ${guildId} after ${failures} consecutive playback failures`
      );
      await this.publishState(guildId);
      return false;
    }

    const nextTrack = queue.next(true);
    if (nextTrack) {
      const generation = this.nextPlaybackGeneration(guildId);
      return this.playTrackLocked(guildId, nextTrack, generation);
    } else {
      await this.publishState(guildId);
      return false;
    }
  }

  private async recoverPlayback(
    guildId: string,
    player: Player,
    nodeName: string,
    encoded?: string,
    reason?: string
  ): Promise<void> {
    const attempt = this.playbackAttempts.get(guildId);
    if (!attempt || !this.isCurrentAttempt(guildId, attempt)) return;

    const failedTrackEncoded = encoded ?? attempt.encoded;
    const failureKey = `${nodeName}:${failedTrackEncoded ?? 'unknown'}`;
    if (attempt.handledFailures.has(failureKey)) return;
    attempt.handledFailures.add(failureKey);
    if (failedTrackEncoded) attempt.triedEncodings.add(failedTrackEncoded);
    if (attempt.encoded) attempt.triedEncodings.add(attempt.encoded);

    if (attempt.recovering) {
      attempt.pendingFailures.push({ nodeName, encoded, reason });
      return;
    }

    attempt.recovering = true;
    try {
      let recovered = false;
      const fallbackNodes = this.getPlaybackNodes(player, attempt.triedNodes);
      if (fallbackNodes.length > 0) {
        console.warn(
          `[Player] Retrying ${attempt.track.title} in guild ${guildId} on fallback node`
        );
        recovered = await this.startTrackOnAvailableNode(guildId, player, attempt, fallbackNodes);
      }

      // If node fallback didn't recover, resolve alternate stream sources
      if (!recovered) {
        const cleanTitle = (attempt.track.title || '').trim();
        const cleanAuthor = (
          attempt.track.author && attempt.track.author !== 'Unknown' && attempt.track.author !== 'Unknown Artist'
            ? attempt.track.author
            : ''
        ).trim();

        const ytBlocked = this.isYouTubeBlocked() || (reason && (
          reason.includes('All clients failed') ||
          reason.includes('bot') ||
          reason.includes('403') ||
          reason.includes('requires login') ||
          reason.includes('Sign in')
        ));

        const fallbackQueries: string[] = [];
        if (cleanTitle) {
          if (ytBlocked) {
            // Prioritize SoundCloud to instantly recover audio without another failure
            fallbackQueries.push(`scsearch:${cleanTitle} ${cleanAuthor}`.trim());
            if (cleanAuthor) fallbackQueries.push(`scsearch:${cleanTitle}`);
            fallbackQueries.push(`ytmsearch:${cleanTitle} ${cleanAuthor}`.trim());
          } else {
            fallbackQueries.push(`ytmsearch:${cleanTitle} ${cleanAuthor}`.trim());
            fallbackQueries.push(`scsearch:${cleanTitle} ${cleanAuthor}`.trim());
            if (cleanAuthor) fallbackQueries.push(`scsearch:${cleanTitle}`);
          }
        }

        for (const query of fallbackQueries) {
          if (recovered) break;
          try {
            console.warn(`[Player] Searching fallback stream for "${cleanTitle}" via "${query}"`);
            const result = await player.node.rest.resolve(query);
            let candidates: Track[] = [];
            if (result) {
              if (result.loadType === LoadType.TRACK) candidates = [result.data];
              else if (result.loadType === LoadType.SEARCH) candidates = result.data;
              else if (result.loadType === LoadType.PLAYLIST) candidates = result.data.tracks;
            }

            const isYt = query.startsWith('ytmsearch') || query.startsWith('ytsearch');
            if (isYt) {
              candidates.sort((a, b) => {
                const aTopic = (a?.info?.author || '').toLowerCase().includes('topic') ? 1 : 0;
                const bTopic = (b?.info?.author || '').toLowerCase().includes('topic') ? 1 : 0;
                return bTopic - aTopic;
              });
            }

            const candidate = candidates.find(
              (t) => t?.encoded && !attempt.triedEncodings.has(t.encoded)
            );

            if (candidate?.encoded) {
              attempt.triedEncodings.add(candidate.encoded);
              attempt.encoded = candidate.encoded;
              attempt.track.encoded = candidate.encoded;
              attempt.track.url = candidate.info.uri || attempt.track.url;
              attempt.track.identifier = candidate.info.identifier || attempt.track.identifier;
              if (candidate.info.sourceName) attempt.track.source = candidate.info.sourceName;

              await player.playTrack({
                track: { encoded: candidate.encoded },
                paused: false,
                volume: this.getQueue(guildId).volume,
              });

              console.log(`[Player] Fallback stream (${query.split(':')[0]}) for "${candidate.info.title}" started on node ${player.node.name}`);
              await this.publishState(guildId);
              recovered = true;
              break;
            }
          } catch (queryErr) {
            console.warn(`[Player] Query "${query}" failed during recovery:`, queryErr);
          }
        }
      }

      if (!recovered) {
        await this.advanceAfterPlaybackFailure(guildId, attempt);
      }
    } finally {
      attempt.recovering = false;

      if (this.isCurrentAttempt(guildId, attempt) && attempt.pendingFailures.length > 0) {
        const pending = attempt.pendingFailures.shift()!;
        await this.recoverPlayback(guildId, player, pending.nodeName, pending.encoded, pending.reason);
      }
    }
  }

  private async handleTrackEnd(guildId: string, player: Player, data: TrackEndEvent): Promise<void> {
    if (data.reason === 'replaced' || data.reason === 'stopped' || data.reason === 'cleanup') return;

    const queue = this.getQueue(guildId);
    const attempt = this.playbackAttempts.get(guildId);
    if (!attempt || !this.isCurrentAttempt(guildId, attempt)) return;
    if (attempt?.encoded && data.track.encoded !== attempt.encoded) return;

    if (data.reason === 'loadFailed') {
      await this.recoverPlayback(guildId, player, player.node.name, data.track.encoded, 'loadFailed');
      return;
    }

    if (data.reason !== 'finished') return;

    if (this.playbackAttempts.get(guildId) === attempt) {
      this.playbackAttempts.delete(guildId);
    }
    this.consecutivePlaybackFailures.set(guildId, 0);
    const nextTrack = queue.next();
    if (nextTrack) {
      const generation = this.nextPlaybackGeneration(guildId);
      await this.playTrackLocked(guildId, nextTrack, generation);
    } else {
      await this.publishState(guildId);
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

  private nextPlaybackGeneration(guildId: string): number {
    const generation = (this.playbackGenerations.get(guildId) ?? 0) + 1;
    this.playbackGenerations.set(guildId, generation);
    return generation;
  }

  private isCurrentAttempt(guildId: string, attempt: PlaybackAttempt): boolean {
    return this.playbackAttempts.get(guildId) === attempt
      && this.playbackGenerations.get(guildId) === attempt.generation;
  }

  private invalidatePlayback(guildId: string): void {
    this.nextPlaybackGeneration(guildId);
    this.playbackAttempts.delete(guildId);
  }

  private runGuildOperation<T>(guildId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.guildOperations.get(guildId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.guildOperations.set(guildId, tail);
    void tail.then(() => {
      if (this.guildOperations.get(guildId) === tail) {
        this.guildOperations.delete(guildId);
      }
    });
    return result;
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
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('The bot is not in this Discord server');

    const voiceChannel = guild.channels.cache.get(channelId);
    if (voiceChannel && voiceChannel.isVoiceBased()) {
      const botMember = guild.members.me ?? (await guild.members.fetch(this.client.user!.id).catch(() => null));
      if (botMember) {
        const perms = voiceChannel.permissionsFor(botMember);
        if (!perms?.has('ViewChannel')) {
          throw new Error(`The bot cannot view voice channel "${voiceChannel.name}". Grant "View Channel" or Administrator to the bot in Discord.`);
        }
        if (!perms?.has('Connect')) {
          throw new Error(`The bot cannot connect to voice channel "${voiceChannel.name}". Grant "Connect" or Administrator to the bot in Discord.`);
        }
      }
    }

    let player = this.shoukaku.players.get(guildId);
    if (player) {
      const activeChannelId = this.shoukaku.connections.get(guildId)?.channelId;
      if (activeChannelId && activeChannelId !== channelId) {
        throw new Error('The bot is already active in another voice channel');
      }
      await player.setGlobalVolume(this.getQueue(guildId).volume);
      return player;
    }

    await this.connectLavalink();

    const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
    if (!node) throw new Error('No Lavalink nodes available');

    const shardId = guild.shardId ?? 0;

    player = await this.shoukaku.joinVoiceChannel({
      guildId,
      channelId,
      shardId,
      deaf: true,
    });

    // Set up event handlers
    player.on('start', async (data) => {
      const attempt = this.playbackAttempts.get(guildId);
      if (!attempt || (attempt.encoded && data.track.encoded !== attempt.encoded)) return;

      this.consecutivePlaybackFailures.set(guildId, 0);
      if (!attempt.announced) {
        attempt.announced = true;
        await this.publishTrackStart(guildId, attempt.track);
      }
      await this.publishState(guildId);
    });

    player.on('end', (data) => {
      void this.runGuildOperation(guildId, () => this.handleTrackEnd(guildId, player, data)).catch((error) => {
        console.error(`[Player] Failed to handle track end in guild ${guildId}:`, error);
      });
    });

    player.on('stuck', (data) => {
      const nodeName = player.node.name;
      console.warn(`[Player] Track stuck on node ${nodeName} in guild ${guildId}`);
      void this.runGuildOperation(
        guildId,
        () => this.recoverPlayback(guildId, player, nodeName, data.track.encoded)
      ).catch((error) => {
        console.error(`[Player] Failed to recover stuck track in guild ${guildId}:`, error);
      });
    });

    player.on('exception', (error) => {
      const nodeName = player.node.name;
      const exceptionMessage = (error as any)?.exception?.message || (error as any)?.message || '';
      const failedEncoded = (error as any)?.track?.encoded || (typeof (error as any)?.track === 'string' ? (error as any).track : undefined);
      console.error(`[Player] Exception on node ${nodeName} in guild ${guildId}:`, error);

      if (
        exceptionMessage.includes('All clients failed') ||
        exceptionMessage.includes('bot') ||
        exceptionMessage.includes('403') ||
        exceptionMessage.includes('requires login') ||
        exceptionMessage.includes('Sign in') ||
        exceptionMessage.includes('unavailable')
      ) {
        this.markYouTubeBlocked(exceptionMessage);
      }

      void this.runGuildOperation(
        guildId,
        () => this.recoverPlayback(guildId, player, nodeName, failedEncoded, exceptionMessage)
      ).catch((recoveryError) => {
        console.error(`[Player] Failed to recover playback in guild ${guildId}:`, recoveryError);
      });
    });

    await player.setGlobalVolume(this.getQueue(guildId).volume);
    return player;
  }

  async search(query: string, source: string = 'ytmsearch'): Promise<LavalinkResponse | undefined> {
    await this.connectLavalink();

    let searchQuery = query;
    if (!query.startsWith('http') && !query.includes(':')) {
      searchQuery = `${source}:${query}`;
    }

    const result = await this.resolveWithFallback(searchQuery);
    if (result && result.loadType !== LoadType.EMPTY && result.loadType !== LoadType.ERROR) {
      return result;
    }

    // If initial search returned no results or failed, and it wasn't scsearch, try scsearch:
    if (!query.startsWith('http') && !query.includes(':') && source !== 'scsearch') {
      console.log(`[Search] Query "${searchQuery}" returned no tracks; falling back to scsearch:${query}`);
      return this.resolveWithFallback(`scsearch:${query}`);
    }

    return result;
  }

  async playTrack(guildId: string, track: QueueTrack): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const generation = this.nextPlaybackGeneration(guildId);
      return this.playTrackLocked(guildId, track, generation);
    });
  }

  async playWebTracks(
    guildId: string,
    tracks: QueueTrack[],
    action: 'play' | 'queue',
    maxQueueSize?: number
  ): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      if (tracks.length === 0) return false;
      const queue = this.getQueue(guildId);
      queue.maxSize = maxQueueSize ? Math.min(maxQueueSize, 500) : 500;

      if (action === 'queue') {
        const wasIdle = !queue.current && !this.getState(guildId).isPlaying;
        if (queue.addMany(tracks) !== tracks.length) {
          throw new Error(`Queue limit is ${queue.maxSize} tracks`);
        }
        if (!wasIdle) {
          await this.publishState(guildId);
          return true;
        }

        const first = queue.next(true);
        if (!first) return false;
        return this.playTrackLocked(guildId, first, this.nextPlaybackGeneration(guildId));
      }

      const [first, ...remaining] = tracks;
      // If playing a single track while something is already playing or queued,
      // change to play this track immediately without destroying the existing queue!
      if (tracks.length === 1 && (queue.current || queue.tracks.length > 0)) {
        const existingIdx = queue.tracks.findIndex(
          (t) => (t.url && t.url === first.url) || (t.identifier && t.identifier === first.identifier)
        );
        if (existingIdx !== -1) {
          queue.tracks.splice(existingIdx, 1);
        }
        return this.playTrackLocked(guildId, first, this.nextPlaybackGeneration(guildId));
      }

      queue.clear();
      if (queue.addMany(remaining) !== remaining.length) {
        throw new Error(`Queue limit is ${queue.maxSize} tracks`);
      }
      return this.playTrackLocked(guildId, first, this.nextPlaybackGeneration(guildId));
    });
  }

  private async playTrackLocked(
    guildId: string,
    track: QueueTrack,
    generation: number
  ): Promise<boolean> {
    const queue = this.getQueue(guildId);
    if (queue.current && queue.current !== track) {
      queue.history.push(queue.current);
      if (queue.history.length > 100) queue.history.shift();
    }
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
      return false;
    }

    await this.connectLavalink();

    const attempt: PlaybackAttempt = {
      track,
      generation,
      triedNodes: new Set(),
      handledFailures: new Set(),
      triedEncodings: new Set(track.encoded ? [track.encoded] : []),
      pendingFailures: [],
      recovering: false,
      announced: false,
    };
    this.playbackAttempts.set(guildId, attempt);

    const started = await this.startTrackOnAvailableNode(
      guildId,
      player,
      attempt,
      this.getPlaybackNodes(player)
    );
    if (!started) {
      return this.advanceAfterPlaybackFailure(guildId, attempt);
    }
    return true;
  }

  async skip(guildId: string): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      this.invalidatePlayback(guildId);
      const next = this.getQueue(guildId).next(true);
      if (!next) {
        await this.stopLocked(guildId);
        return false;
      }
      return this.playTrackLocked(guildId, next, this.nextPlaybackGeneration(guildId));
    });
  }

  async playPrevious(guildId: string): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const queue = this.getQueue(guildId);
      if (queue.history.length === 0) return false;
      this.invalidatePlayback(guildId);
      const previous = queue.previous();
      if (!previous) return false;
      return this.playTrackLocked(guildId, previous, this.nextPlaybackGeneration(guildId));
    });
  }

  async jumpTo(guildId: string, index: number): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const queue = this.getQueue(guildId);
      if (index < 0 || index >= queue.tracks.length) return false;
      this.invalidatePlayback(guildId);
      const track = queue.jump(index);
      if (!track) return false;
      return this.playTrackLocked(guildId, track, this.nextPlaybackGeneration(guildId));
    });
  }

  async setLoopMode(guildId: string, mode: 'off' | 'track' | 'queue'): Promise<void> {
    await this.runGuildOperation(guildId, async () => {
      this.getQueue(guildId).loopMode = mode;
      await this.publishState(guildId);
    });
  }

  async shuffleQueue(guildId: string): Promise<void> {
    await this.runGuildOperation(guildId, async () => {
      this.getQueue(guildId).shuffle();
      await this.publishState(guildId);
    });
  }

  async clearQueue(guildId: string): Promise<void> {
    await this.runGuildOperation(guildId, async () => {
      this.getQueue(guildId).clear();
      await this.publishState(guildId);
    });
  }

  async removeQueuedTrack(guildId: string, index: number): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const removed = this.getQueue(guildId).remove(index);
      if (!removed) return false;
      await this.publishState(guildId);
      return true;
    });
  }

  async moveQueuedTrack(guildId: string, from: number, to: number): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const moved = this.getQueue(guildId).move(from, to);
      if (!moved) return false;
      await this.publishState(guildId);
      return true;
    });
  }

  async stop(guildId: string): Promise<void> {
    await this.runGuildOperation(guildId, () => this.stopLocked(guildId));
  }

  private async stopLocked(guildId: string): Promise<void> {
    this.invalidatePlayback(guildId);
    this.consecutivePlaybackFailures.delete(guildId);
    this.getQueue(guildId).reset();

    const player = this.shoukaku.players.get(guildId);
    if (player) await player.stopTrack();
    await this.publishState(guildId);
  }

  async disconnect(guildId: string): Promise<void> {
    await this.stop(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
    this.queues.delete(guildId);
  }

  async setVolume(guildId: string, volume: number): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const player = this.shoukaku.players.get(guildId);
      if (!player) return false;
      await player.setGlobalVolume(volume);
      const queue = this.getQueue(guildId);
      queue.volume = volume;
      await this.publishState(guildId);
      return true;
    });
  }

  async seek(guildId: string, positionMs: number): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const player = this.shoukaku.players.get(guildId);
      if (!player || !this.getQueue(guildId).current) return false;
      await player.seekTo(positionMs);
      await this.publishState(guildId);
      return true;
    });
  }

  async pause(guildId: string): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const player = this.shoukaku.players.get(guildId);
      if (!player || !this.getQueue(guildId).current) return false;
      await player.setPaused(true);
      await this.publishState(guildId);
      return true;
    });
  }

  async resume(guildId: string): Promise<boolean> {
    return this.runGuildOperation(guildId, async () => {
      const player = this.shoukaku.players.get(guildId);
      if (!player || !this.getQueue(guildId).current) return false;
      await player.setPaused(false);
      await this.publishState(guildId);
      return true;
    });
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
