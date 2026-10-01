/**
 * /playlist — playlist management is currently provided by the web portal.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotCommand } from '../../types';
import { errorEmbed } from '../../utils/embeds';

export const playlist: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Manage playlists')
    .addSubcommand(sub =>
      sub.setName('create').setDescription('Create a new playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List your playlists'))
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
    await interaction.reply({
      embeds: [errorEmbed(`Playlist ${subcommand} is not available in Discord yet. Use the web portal.`)],
      ephemeral: true,
    });
  },
};
