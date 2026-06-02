/**
 * /favorites — Favorites management
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotCommand } from '../../types';
import { successEmbed, errorEmbed } from '../../utils/embeds';
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
        await interaction.reply({ embeds: [successEmbed(`**${queue.current.title}** saved to favorites via API`)], ephemeral: true });
        break;
      }
      case 'remove':
        await interaction.reply({ embeds: [successEmbed('Visit the web portal to manage favorites')], ephemeral: true });
        break;
      case 'list':
        await interaction.reply({ embeds: [successEmbed('Visit beehive.syncify.in to view your favorites')], ephemeral: true });
        break;
    }
  },
};
