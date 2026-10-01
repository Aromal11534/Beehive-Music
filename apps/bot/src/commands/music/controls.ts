/**
 * Music control commands — pause, resume, stop, skip, previous, nowplaying, volume, seek, search
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { LoadType, type Track } from 'shoukaku';
import { BotCommand } from '../../types';
import { MusicManager } from '../../music/MusicManager';
import { nowPlayingEmbed, errorEmbed, successEmbed, formatDuration } from '../../utils/embeds';
import { voiceControlError } from '../../utils/voiceGuard';

let musicManager: MusicManager;
export function setMusicManager(mm: MusicManager) { musicManager = mm; }

async function rejectInvalidVoice(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const error = voiceControlError(interaction, musicManager);
  if (!error) return false;
  await interaction.reply({ embeds: [errorEmbed(error)], ephemeral: true });
  return true;
}

export const pause: BotCommand = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    await musicManager.pause(interaction.guildId!);
    await interaction.reply({ embeds: [successEmbed('Playback paused')] });
  },
};

export const resume: BotCommand = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    await musicManager.resume(interaction.guildId!);
    await interaction.reply({ embeds: [successEmbed('Playback resumed')] });
  },
};

export const stop: BotCommand = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear queue'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    await musicManager.disconnect(interaction.guildId!);
    await interaction.reply({ embeds: [successEmbed('Stopped and disconnected')] });
  },
};

export const skip: BotCommand = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const guildId = interaction.guildId!;
    if (await musicManager.skip(guildId)) {
      const current = musicManager.getQueue(guildId).current;
      await interaction.reply({ embeds: [current ? nowPlayingEmbed(current) : successEmbed('Skipped')] });
    } else {
      await interaction.reply({ embeds: [successEmbed('Queue finished')] });
    }
  },
};

export const previous: BotCommand = {
  data: new SlashCommandBuilder().setName('previous').setDescription('Play the previous track'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const guildId = interaction.guildId!;
    if (await musicManager.playPrevious(guildId)) {
      const current = musicManager.getQueue(guildId).current;
      await interaction.reply({ embeds: [current ? nowPlayingEmbed(current) : successEmbed('Playing previous track')] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('No previous track in history')], ephemeral: true });
    }
  },
};

export const nowplaying: BotCommand = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show the currently playing track'),
  async execute(interaction: ChatInputCommandInteraction) {
    const state = musicManager.getState(interaction.guildId!);
    if (!state.currentTrack) {
      await interaction.reply({ embeds: [errorEmbed('Nothing is playing')], ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [nowPlayingEmbed(state.currentTrack, state.positionMs)] });
  },
};

export const volume: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume')
    .addIntegerOption(opt => opt.setName('level').setDescription('Volume level (0-200)').setRequired(true).setMinValue(0).setMaxValue(200)),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const level = interaction.options.getInteger('level', true);
    await musicManager.setVolume(interaction.guildId!, level);
    await interaction.reply({ embeds: [successEmbed(`Volume set to **${level}%**`)] });
  },
};

export const seek: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a position in the current track')
    .addIntegerOption(opt => opt.setName('seconds').setDescription('Position in seconds').setRequired(true).setMinValue(0)),
  async execute(interaction: ChatInputCommandInteraction) {
    if (await rejectInvalidVoice(interaction)) return;
    const seconds = interaction.options.getInteger('seconds', true);
    await musicManager.seek(interaction.guildId!, seconds * 1000);
    await interaction.reply({ embeds: [successEmbed(`Seeked to **${formatDuration(seconds * 1000)}**`)] });
  },
};

export const search: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for tracks')
    .addStringOption(opt => opt.setName('query').setDescription('Search query').setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const query = interaction.options.getString('query', true);

    try {
      const result = await musicManager.search(query);
      if (!result || result.loadType === LoadType.EMPTY || result.loadType === LoadType.ERROR) {
        await interaction.editReply({ embeds: [errorEmbed('No results found.')] });
        return;
      }

      const tracks: Track[] = result.loadType === LoadType.PLAYLIST
        ? result.data.tracks.slice(0, 10)
        : (Array.isArray(result.data) ? result.data : [result.data]).slice(0, 10);
      const embed = new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('🔍 Search Results')
        .setDescription(
          tracks.map((t, i) =>
            `\`${i + 1}.\` **[${t.info.title}](${t.info.uri})** — ${t.info.author} (\`${formatDuration(t.info.length)}\`)`
          ).join('\n')
        )
        .setFooter({ text: 'Use /play with a URL to play a specific result' });

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply({ embeds: [errorEmbed('Search failed.')] });
    }
  },
};

export const autoplay: BotCommand = {
  data: new SlashCommandBuilder().setName('autoplay').setDescription('Toggle autoplay mode'),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ embeds: [errorEmbed('Autoplay is not available yet. Use the web queue to add more tracks.')], ephemeral: true });
  },
};
