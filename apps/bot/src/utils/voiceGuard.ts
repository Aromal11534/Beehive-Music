import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { MusicManager } from '../music/MusicManager';

export function voiceControlError(
  interaction: ChatInputCommandInteraction,
  musicManager: MusicManager
): string | null {
  const member = interaction.member as GuildMember | null;
  const memberChannelId = member?.voice.channel?.id;
  if (!memberChannelId) return 'Join a voice channel before controlling playback.';

  const guildId = interaction.guildId;
  const activeChannelId = guildId
    ? musicManager.shoukaku.connections.get(guildId)?.channelId
    : undefined;
  if (activeChannelId && activeChannelId !== memberChannelId) {
    return 'You must be in the same voice channel as the bot.';
  }
  return null;
}
