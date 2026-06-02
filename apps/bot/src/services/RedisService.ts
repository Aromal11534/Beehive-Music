/**
 * Redis service for pub/sub and state management
 */

import Redis from 'ioredis';
import { config } from '../config';

export class RedisService {
  public client: Redis;
  public subscriber: Redis;

  constructor() {
    this.client = new Redis(config.redisUrl);
    this.subscriber = new Redis(config.redisUrl);

    this.client.on('connect', () => console.log('[Redis] Client connected'));
    this.client.on('error', (err) => console.error('[Redis] Client error:', err));
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, msg) => {
      if (ch === channel) handler(msg);
    });
  }

  async psubscribe(pattern: string, handler: (channel: string, message: string) => void): Promise<void> {
    await this.subscriber.psubscribe(pattern);
    this.subscriber.on('pmessage', (_pattern, ch, msg) => {
      handler(ch, msg);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async close(): Promise<void> {
    this.client.disconnect();
    this.subscriber.disconnect();
  }
}
