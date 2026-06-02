/**
 * Deploy slash commands to Discord API
 * Run: npm run deploy-commands
 */

import { REST, Routes } from 'discord.js';
import { config } from './config';

// Import all command data
import { play } from './commands/music/play';
import { pause, resume, stop, skip, previous, nowplaying, volume, seek, search, autoplay } from './commands/music/controls';
import { queue, shuffle, loop, clear, remove, move, jump } from './commands/queue/queue';
import { playlist } from './commands/playlist/playlist';
import { favorites } from './commands/favorites/favorites';
import { help } from './commands/general/help';
import { serverPlayer } from './commands/settings/serverPlayer';

const commands = [
  play, pause, resume, stop, skip, previous, nowplaying,
  volume, seek, search, autoplay,
  queue, shuffle, loop, clear, remove, move, jump,
  playlist, favorites, help, serverPlayer,
].map(cmd => cmd.data.toJSON());

async function deploy() {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  try {
    console.log(`🔄 Deploying ${commands.length} slash commands...`);

    if (config.discordDevGuildId) {
      // Guild commands (instant, for dev)
      await rest.put(
        Routes.applicationGuildCommands(config.discordClientId, config.discordDevGuildId),
        { body: commands },
      );
      console.log(`✅ Deployed to guild ${config.discordDevGuildId}`);
    } else {
      // Global commands (may take up to 1 hour to propagate)
      await rest.put(
        Routes.applicationCommands(config.discordClientId),
        { body: commands },
      );
      console.log('✅ Deployed globally');
    }
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
  }
}

deploy();
