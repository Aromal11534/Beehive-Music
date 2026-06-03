/**
 * /help — Show available commands
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../../types';

export const help: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all Beehive bot commands'),

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle('🐝 Beehive — Commands')
      .setDescription('A premium Discord music bot with web control panel')
      .addFields(
        {
          name: '🎵 Music',
          value: '`/play` `/search` `/pause` `/resume` `/stop` `/skip` `/previous` `/nowplaying` `/volume` `/seek` `/autoplay`',
        },
        {
          name: '📋 Queue',
          value: '`/queue` `/shuffle` `/loop` `/clear` `/remove` `/move` `/jump`',
        },
        {
          name: '💿 Playlists',
          value: '`/playlist create` `/playlist add` `/playlist remove` `/playlist list` `/playlist load`',
        },
        {
          name: '⭐ Favorites',
          value: '`/favorites add` `/favorites remove` `/favorites list`',
        },
        {
          name: '⚙️ Settings',
          value: '`/server-player settings` `/server-player bind`',
        },
        {
          name: '🌐 Web Portal',
          value: 'Full control panel at **beehive.teamsyndicate.org**',
        },
      )
      .setFooter({ text: 'Beehive Music Bot • beehive.teamsyndicate.org' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
