/**
 * /playlist — Playlist management subcommands
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotCommand } from '../../types';
import { successEmbed, errorEmbed } from '../../utils/embeds';

export const playlist: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Manage playlists')
    .addSubcommand(sub =>
      sub.setName('create').setDescription('Create a new playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List your playlists')
    )
    .addSubcommand(sub =>
      sub.setName('add').setDescription('Add the current track to a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove').setDescription('Remove a track from a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
        .addIntegerOption(opt => opt.setName('position').setDescription('Track position').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('load').setDescription('Load a playlist into the queue')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create':
        await interaction.reply({ embeds: [successEmbed(`Playlist creation — connect with the web portal at beehive.syncify.in for full playlist management`)], ephemeral: true });
        break;
      case 'list':
        await interaction.reply({ embeds: [successEmbed('Visit the web portal for full playlist management')], ephemeral: true });
        break;
      case 'add':
        await interaction.reply({ embeds: [successEmbed('Track queued for playlist addition via web portal')], ephemeral: true });
        break;
      case 'remove':
        await interaction.reply({ embeds: [successEmbed('Use the web portal for track removal')], ephemeral: true });
        break;
      case 'load':
        await interaction.reply({ embeds: [successEmbed('Playlist loading — feature connects to the API for retrieval')], ephemeral: true });
        break;
      default:
        await interaction.reply({ embeds: [errorEmbed('Unknown subcommand')], ephemeral: true });
    }
  },
};
