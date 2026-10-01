/**
 * Queue management commands — queue, shuffle, loop, clear, remove, move, jump
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotCommand } from '../../types';
import { MusicManager } from '../../music/MusicManager';
import { queueEmbed, errorEmbed, successEmbed } from '../../utils/embeds';
import { voiceControlError } from '../../utils/voiceGuard';

let musicManager: MusicManager;
export function setMusicManager(mm: MusicManager) { musicManager = mm; }

async function rejectInvalidVoice(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const error = voiceControlError(interaction, musicManager);
  if (!error) return false;
  await interaction.reply({ embeds: [errorEmbed(error)], ephemeral: true });
  return true;
}

export const queue: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue')
    .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setRequired(false).setMinValue(1)),
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const q = musicManager.getQueue(guildId);
    const page = (interaction.options.getInteger('page') || 1) - 1;
    await interaction.reply({ embeds: [queueEmbed(q.tracks, q.current, page)] });
  },
};

export const shuffle: BotCommand = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const q = musicManager.getQueue(interaction.guildId!);
    q.shuffle();
    await musicManager.publishState(interaction.guildId!);
    await interaction.reply({ embeds: [successEmbed(`Shuffled **${q.length}** tracks`)] });
  },
};

export const loop: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set loop mode')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Track', value: 'track' },
          { name: 'Queue', value: 'queue' },
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const mode = interaction.options.getString('mode', true) as 'off' | 'track' | 'queue';
    const q = musicManager.getQueue(interaction.guildId!);
    q.loopMode = mode;
    await musicManager.publishState(interaction.guildId!);

    const labels = { off: '▶️ Off', track: '🔂 Track', queue: '🔁 Queue' };
    await interaction.reply({ embeds: [successEmbed(`Loop mode: **${labels[mode]}**`)] });
  },
};

export const clear: BotCommand = {
  data: new SlashCommandBuilder().setName('clear').setDescription('Clear the queue'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const q = musicManager.getQueue(interaction.guildId!);
    q.clear();
    await musicManager.publishState(interaction.guildId!);
    await interaction.reply({ embeds: [successEmbed('Queue cleared')] });
  },
};

export const remove: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue')
    .addIntegerOption(opt => opt.setName('position').setDescription('Track position (1-based)').setRequired(true).setMinValue(1)),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const pos = interaction.options.getInteger('position', true) - 1;
    const q = musicManager.getQueue(interaction.guildId!);
    const removed = q.remove(pos);
    if (removed) {
      await musicManager.publishState(interaction.guildId!);
      await interaction.reply({ embeds: [successEmbed(`Removed **${removed.title}**`)] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Invalid position')], ephemeral: true });
    }
  },
};

export const move: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a track in the queue')
    .addIntegerOption(opt => opt.setName('from').setDescription('Current position').setRequired(true).setMinValue(1))
    .addIntegerOption(opt => opt.setName('to').setDescription('New position').setRequired(true).setMinValue(1)),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const from = interaction.options.getInteger('from', true) - 1;
    const to = interaction.options.getInteger('to', true) - 1;
    const q = musicManager.getQueue(interaction.guildId!);
    if (q.move(from, to)) {
      await musicManager.publishState(interaction.guildId!);
      await interaction.reply({ embeds: [successEmbed(`Moved track from #${from + 1} to #${to + 1}`)] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Invalid positions')], ephemeral: true });
    }
  },
};

export const jump: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('jump')
    .setDescription('Jump to a specific track in the queue')
    .addIntegerOption(opt => opt.setName('position').setDescription('Track position').setRequired(true).setMinValue(1)),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const pos = interaction.options.getInteger('position', true) - 1;
    const guildId = interaction.guildId!;
    if (await musicManager.jumpTo(guildId, pos)) {
      const track = musicManager.getQueue(guildId).current;
      await interaction.reply({ embeds: [successEmbed(`Jumped to **${track?.title || 'selected track'}**`)] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Invalid position')], ephemeral: true });
    }
  },
};
