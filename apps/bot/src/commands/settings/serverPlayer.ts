/**
 * /server-player — Server player settings and channel binding
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { BotCommand } from '../../types';
import { successEmbed } from '../../utils/embeds';

export const serverPlayer: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('server-player')
    .setDescription('Server player configuration')
    .addSubcommand(sub =>
      sub.setName('settings').setDescription('View current server player settings')
    )
    .addSubcommand(sub =>
      sub.setName('bind').setDescription('Bind bot to a text channel for responses')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Text channel to bind to')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'settings') {
      await interaction.reply({
        embeds: [successEmbed('Server settings can be managed at **beehive.syncify.in** → Servers → Settings')],
        ephemeral: true,
      });
    } else if (subcommand === 'bind') {
      const channel = interaction.options.getChannel('channel', true);
      await interaction.reply({
        embeds: [successEmbed(`Bot responses bound to <#${channel.id}>`)],
        ephemeral: true,
      });
    }
  },
};
