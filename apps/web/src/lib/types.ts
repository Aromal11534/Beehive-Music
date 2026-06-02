export interface User {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  avatar_path: string | null;
  is_active: boolean;
  is_admin: boolean;
  mfa_enabled: boolean;
  created_at?: string;
}

export interface Guild {
  discord_guild_id?: string;
  name?: string;
}

export interface GuildAccess {
  id: number;
  guild_id: number;
  role: string;
  guild?: Guild;
}

export interface TrackHistoryEntry {
  track_title: string;
  track_author?: string | null;
  played_at: string;
}

export interface FavoriteTrack {
  id: number;
  track_title: string;
  track_author?: string | null;
  track_url: string;
  track_identifier?: string | null;
  source?: string | null;
  duration_ms?: number | null;
  artwork_url?: string | null;
  created_at?: string;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  track_count?: number;
  playlist_type: string;
}

export interface PlaylistTrack {
  id: number;
  track_title: string;
  track_author?: string | null;
  track_url: string;
  duration_ms?: number;
  artwork_url?: string;
  position: number;
}

export interface PlaylistDetail extends PlaylistSummary {
  tracks: PlaylistTrack[];
}

export interface SearchTrack {
  title: string;
  author: string;
}

export interface PlayerTrack {
  title?: string;
  track_title?: string;
  author?: string;
  track_author?: string;
  artwork_url?: string;
  duration?: number;
  duration_ms?: number;
  url?: string;
  identifier?: string;
  source?: string;
}

export interface PlayerState {
  guild_id: string;
  is_playing: boolean;
  is_paused: boolean;
  current_track: PlayerTrack | null;
  position_ms: number;
  volume: number;
  loop_mode: string;
  queue: PlayerTrack[];
}

export interface MfaStatus {
  is_enabled: boolean;
}

export interface SessionInfo {
  id: number;
  ip_address?: string | null;
  user_agent?: string | null;
}
