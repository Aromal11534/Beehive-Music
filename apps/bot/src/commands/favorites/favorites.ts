/**
 * /favorites — Favorites management
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotCommand } from '../../types';
import { errorEmbed } from '../../utils/embeds';
import { MusicManager } from '../../music/MusicManager';

let musicManager: MusicManager;
export function setMusicManager(mm: MusicManager) { musicManager = mm; }

export const favorites: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('favorites')
    .setDescription('Manage your favorite tracks')
    .addSubcommand(sub => sub.setName('add').setDescription('Add the current track to favorites'))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a track from favorites').addIntegerOption(opt => opt.setName('id').setDescription('Favorite ID').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('List your favorites')),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    switch (subcommand) {
      case 'add': {
        const queue = musicManager.getQueue(guildId);
        if (!queue.current) {
          await interaction.reply({ embeds: [errorEmbed('Nothing is playing')], ephemeral: true });
          return;
        }
        await interaction.reply({ embeds: [errorEmbed('Saving favorites from Discord is not available yet. Use the web player for this track.')], ephemeral: true });
        break;
      }
      case 'remove':
        await interaction.reply({ embeds: [errorEmbed('Favorite removal is available in the web portal.')], ephemeral: true });
        break;
      case 'list':
        await interaction.reply({ embeds: [errorEmbed('Favorite listing is available in the web portal.')], ephemeral: true });
        break;
    }
  },
};
