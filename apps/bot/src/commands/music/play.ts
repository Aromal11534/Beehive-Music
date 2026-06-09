/**
 * /play — Play a track by search query or URL
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { LoadType, type Track } from 'shoukaku';
import { BotCommand, QueueTrack } from '../../types';
import { MusicManager } from '../../music/MusicManager';
import { nowPlayingEmbed, trackAddedEmbed, errorEmbed } from '../../utils/embeds';
import { getArtworkUrl } from '../../utils/helpers';

let musicManager: MusicManager;
export function setMusicManager(mm: MusicManager) { musicManager = mm; }

export const play: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song by search query or URL')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('Search query or URL')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    if (!member.voice.channel) {
      await interaction.reply({ embeds: [errorEmbed('You must be in a voice channel!')], ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const query = interaction.options.getString('query', true);
    const guildId = interaction.guildId!;

    try {
      // Join voice channel
      await musicManager.joinChannel(guildId, member.voice.channel.id);

      // Search
      const result = await musicManager.search(query);
      if (!result || result.loadType === LoadType.EMPTY || result.loadType === LoadType.ERROR) {
        await interaction.editReply({ embeds: [errorEmbed('No results found.')] });
        return;
      }

      const queue = musicManager.getQueue(guildId);

      // Handle playlist
      if (result.loadType === LoadType.PLAYLIST) {
        const tracks: QueueTrack[] = result.data.tracks.map((t) => ({
          encoded: t.encoded,
          title: t.info.title,
          author: t.info.author,
          url: t.info.uri ?? t.info.identifier,
          identifier: t.info.identifier,
          duration: t.info.length,
          artworkUrl: getArtworkUrl({
            artworkUrl: t.info.artworkUrl,
            sourceName: t.info.sourceName,
            identifier: t.info.identifier,
          }),
          source: t.info.sourceName,
          requestedBy: interaction.user.displayName,
          requestedById: interaction.user.id,
        }));

        queue.addMany(tracks);
        if (!queue.current) {
          const first = queue.next();
          if (first) await musicManager.playTrack(guildId, first);
        } else {
          await musicManager.publishState(guildId);
        }
        await interaction.editReply({ content: `📋 Added **${tracks.length}** tracks from playlist` });
        return;
      }

      // Handle single track or search result
      const trackData: Track = result.loadType === LoadType.SEARCH ? result.data[0] : result.data;
      const track: QueueTrack = {
        encoded: trackData.encoded,
        title: trackData.info.title,
        author: trackData.info.author,
        url: trackData.info.uri ?? trackData.info.identifier,
        identifier: trackData.info.identifier,
        duration: trackData.info.length,
        artworkUrl: getArtworkUrl({
          artworkUrl: trackData.info.artworkUrl,
          sourceName: trackData.info.sourceName,
          identifier: trackData.info.identifier,
        }),
        source: trackData.info.sourceName,
        requestedBy: interaction.user.displayName,
        requestedById: interaction.user.id,
      };

      if (!queue.current) {
        queue.current = track;
        await musicManager.playTrack(guildId, track);
        await interaction.editReply({ embeds: [nowPlayingEmbed(track)] });
      } else {
        queue.add(track);
        await interaction.editReply({ embeds: [trackAddedEmbed(track, queue.length)] });
        await musicManager.publishState(guildId);
      }
    } catch (error) {
      console.error('[Play]', error);
      await interaction.editReply({ embeds: [errorEmbed('Failed to play track.')] });
    }
  },
};
