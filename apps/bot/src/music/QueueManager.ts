/**
 * Queue Manager — per-guild queue with loop, shuffle, history
 */

import { QueueTrack, LoopMode } from '../types';

export interface QueueSnapshot {
  version: 1;
  tracks: QueueTrack[];
  history: QueueTrack[];
  current: QueueTrack | null;
  loopMode: LoopMode;
  volume: number;
  savedAt: string;
}

export class QueueManager {
  public tracks: QueueTrack[] = [];
  public history: QueueTrack[] = [];
  public current: QueueTrack | null = null;
  public loopMode: LoopMode = 'off';
  public volume: number = 80;
  private nextQueueId = 1;

  private withQueueId(track: QueueTrack): QueueTrack {
    if (track.queueId) return track;
    return { ...track, queueId: `q-${Date.now()}-${this.nextQueueId++}` };
  }

  static fromSnapshot(snapshot: QueueSnapshot): QueueManager {
    const queue = new QueueManager();
    queue.loopMode = snapshot.loopMode;
    queue.volume = snapshot.volume;
    queue.history = snapshot.history.map((track) => queue.withQueueId(track));

    const restoredTracks = snapshot.current
      ? [snapshot.current, ...snapshot.tracks]
      : snapshot.tracks;
    queue.tracks = restoredTracks.map((track) => queue.withQueueId(track));
    queue.current = null;
    return queue;
  }

  add(track: QueueTrack): void {
    this.tracks.push(this.withQueueId(track));
  }

  addNext(track: QueueTrack): void {
    this.tracks.unshift(this.withQueueId(track));
  }

  addMany(tracks: QueueTrack[]): void {
    this.tracks.push(...tracks.map((track) => this.withQueueId(track)));
  }

  next(): QueueTrack | null {
    if (this.loopMode === 'track' && this.current) {
      return this.current;
    }

    if (this.current) {
      this.history.push(this.current);
      if (this.history.length > 100) this.history.shift();
    }

    if (this.loopMode === 'queue' && this.tracks.length === 0 && this.history.length > 0) {
      this.tracks = [...this.history];
      this.history = [];
    }

    const next = this.tracks.shift() || null;
    this.current = next;
    return next;
  }

  previous(): QueueTrack | null {
    const prev = this.history.pop();
    if (prev) {
      if (this.current) {
        this.tracks.unshift(this.current);
      }
      this.current = prev;
      return prev;
    }
    return null;
  }

  remove(index: number): QueueTrack | null {
    if (index < 0 || index >= this.tracks.length) return null;
    return this.tracks.splice(index, 1)[0] || null;
  }

  move(from: number, to: number): boolean {
    if (from < 0 || from >= this.tracks.length || to < 0 || to >= this.tracks.length) return false;
    const [track] = this.tracks.splice(from, 1);
    this.tracks.splice(to, 0, track);
    return true;
  }

  jump(index: number): QueueTrack | null {
    if (index < 0 || index >= this.tracks.length) return null;
    // Skip everything before the index
    const skipped = this.tracks.splice(0, index);
    if (this.current) this.history.push(this.current);
    this.history.push(...skipped);
    const track = this.tracks.shift() || null;
    this.current = track;
    return track;
  }

  shuffle(): void {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  clear(): void {
    this.tracks = [];
  }

  toSnapshot(): QueueSnapshot {
    return {
      version: 1,
      tracks: this.tracks,
      history: this.history,
      current: this.current,
      loopMode: this.loopMode,
      volume: this.volume,
      savedAt: new Date().toISOString(),
    };
  }

  get length(): number {
    return this.tracks.length;
  }

  get isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  get totalDuration(): number {
    return this.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }

  toJSON(): Array<QueueTrack & { position: number }> {
    return this.tracks.map((t, i) => ({ ...t, position: i }));
  }
}
