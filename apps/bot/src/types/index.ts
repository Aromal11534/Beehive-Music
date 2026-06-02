/**
 * TypeScript interfaces and types for the bot
 */

import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';

export interface BotCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export interface QueueTrack {
  encoded?: string;
  title: string;
  author: string;
  url: string;
  identifier: string;
  duration: number;
  artworkUrl?: string;
  source: string;
  requestedBy: string;
  requestedById?: string;
}

export type LoopMode = 'off' | 'track' | 'queue';

export interface GuildPlayerState {
  guildId: string;
  isPlaying: boolean;
  isPaused: boolean;
  currentTrack: QueueTrack | null;
  positionMs: number;
  volume: number;
  loopMode: LoopMode;
  queue: QueueTrack[];
}
