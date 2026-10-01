/**
 * Beehive Bot — Environment configuration
 */

import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
dotenv.config({ path: '../../.env' });

function envOrFile(value: string | undefined, filePath: string | undefined): string {
  if (filePath) {
    try {
      const fileValue = readFileSync(filePath, 'utf8').trim();
      if (fileValue) return fileValue;
    } catch {
      // Fall back to the explicit environment value for non-Docker setups.
    }
  }
  return value || '';
}

export const config = {
  // Discord
  discordToken: process.env.DISCORD_BOT_TOKEN || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordDevGuildId: process.env.DISCORD_DEV_GUILD_ID || '',

  // Lavalink
  lavalink: {
    host: process.env.LAVALINK_HOST || 'lavalink',
    port: parseInt(process.env.LAVALINK_PORT || '2333'),
    password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
  },

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379/0',

  // API
  apiBaseUrl: process.env.API_BASE_URL || 'http://api:8001',
  internalApiToken: envOrFile(
    process.env.INTERNAL_API_TOKEN,
    process.env.INTERNAL_API_TOKEN_FILE
  ),

  // App
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'debug',
};
