/**
 * Guild Sync Service — syncs bot's Discord guilds to the API database
 */

import { Client } from 'discord.js';
import { config } from '../config';

export class GuildSyncService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async syncGuilds(): Promise<void> {
    const guilds = this.client.guilds.cache.map((guild) => ({
      discord_guild_id: guild.id,
      name: guild.name,
      icon_url: guild.iconURL({ size: 256 }) || undefined,
    }));

    if (guilds.length === 0) {
      console.log('[GuildSync] No guilds to sync');
      return;
    }

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/v1/guilds/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.internalApiToken}`,
        },
        body: JSON.stringify({ guilds }),
      });

      if (response.ok) {
        const data = (await response.json()) as { synced: number; guilds: string[] };
        console.log(`[GuildSync] ✅ Synced ${data.synced} guild(s): ${data.guilds.join(', ')}`);
      } else {
        const text = await response.text();
        console.error(`[GuildSync] ❌ Failed (${response.status}): ${text}`);
      }
    } catch (error) {
      console.error('[GuildSync] ❌ Error syncing guilds:', error);
    }
  }
}
