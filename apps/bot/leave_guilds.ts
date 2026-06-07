import { Client, GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env') });

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  console.log('Bot is in guilds:');
  for (const guild of client.guilds.cache.values()) {
    console.log(`- ${guild.name} (${guild.id})`);
  }

  const targetNames = ['Keli', 'Syncify', 'Keli server', 'Syncify server']; // case-insensitive later
  const guildsToLeave = client.guilds.cache.filter(g => g.name.toLowerCase().includes('keli') || g.name.toLowerCase().includes('syncify'));

  for (const guild of guildsToLeave.values()) {
    console.log(`Leaving guild: ${guild.name} (${guild.id})`);
    try {
      await guild.leave();
      console.log(`Successfully left ${guild.name}`);
    } catch (e) {
      console.error(`Failed to leave ${guild.name}:`, e);
    }
  }

  console.log('Done leaving guilds.');
  client.destroy();
});

client.login(process.env.DISCORD_BOT_TOKEN);
