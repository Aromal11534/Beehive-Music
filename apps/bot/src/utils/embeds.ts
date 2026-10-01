/**
 * Embed builders for consistent Discord message formatting
 */

import { EmbedBuilder } from 'discord.js';
import { QueueTrack } from '../types';

const BEEHIVE_COLOR = 0xF59E0B; // Amber

export function nowPlayingEmbed(track: QueueTrack, position: number = 0): EmbedBuilder {
  const durationStr = formatDuration(track.duration);
  const positionStr = formatDuration(position);
  const progressBar = createProgressBar(position, track.duration);

  const embed = new EmbedBuilder()
    .setColor(BEEHIVE_COLOR)
    .setTitle('🎵 Now Playing')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: 'Artist', value: track.author || 'Unknown', inline: true },
      { name: 'Duration', value: `${positionStr} / ${durationStr}`, inline: true },
      { name: 'Requested by', value: track.requestedBy, inline: true },
      { name: 'Progress', value: progressBar, inline: false },
    );

  if (track.artworkUrl) {
    embed.setThumbnail(track.artworkUrl);
  }

  return embed;
}

export function queueEmbed(queue: QueueTrack[], current: QueueTrack | null, page: number = 0): EmbedBuilder {
  const pageSize = 10;
  const start = page * pageSize;
  const pageQueue = queue.slice(start, start + pageSize);
  const totalPages = Math.ceil(queue.length / pageSize) || 1;

  const embed = new EmbedBuilder()
    .setColor(BEEHIVE_COLOR)
    .setTitle('📋 Queue')
    .setFooter({ text: `Page ${page + 1}/${totalPages} • ${queue.length} tracks` });

  if (current) {
    embed.setDescription(`**Now Playing:** [${current.title}](${current.url})`);
  }

  if (pageQueue.length > 0) {
    const list = pageQueue
      .map((t, i) => `\`${start + i + 1}.\` [${t.title}](${t.url}) — \`${formatDuration(t.duration)}\``)
      .join('\n');
    embed.addFields({ name: 'Up Next', value: list });
  } else {
    embed.addFields({ name: 'Queue', value: 'Empty — use `/play` to add tracks!' });
  }

  return embed;
}

export function trackAddedEmbed(track: QueueTrack, position: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BEEHIVE_COLOR)
    .setTitle('✅ Added to Queue')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: 'Artist', value: track.author || 'Unknown', inline: true },
      { name: 'Duration', value: formatDuration(track.duration), inline: true },
      { name: 'Position', value: `#${position}`, inline: true },
    )
    .setThumbnail(track.artworkUrl || null);
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xEF4444)
    .setTitle('❌ Error')
    .setDescription(message);
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x10B981)
    .setDescription(`✅ ${message}`);
}

export function formatDuration(ms: number): string {
  if (!ms) return '0:00';
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createProgressBar(position: number, duration: number): string {
  const total = 20;
  const filled = duration > 0
    ? Math.max(0, Math.min(total, Math.round((position / duration) * total)))
    : 0;
  const empty = total - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}
