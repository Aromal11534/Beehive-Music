"""Guild and server settings schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class GuildCreate(BaseModel):
    discord_guild_id: str = Field(..., min_length=1, max_length=20)
    name: str | None = None
    icon_url: str | None = None


class GuildUpdate(BaseModel):
    name: str | None = None
    icon_url: str | None = None


class GuildResponse(BaseModel):
    id: int
    discord_guild_id: str
    name: str | None = None
    icon_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GuildAccessCreate(BaseModel):
    user_id: int
    guild_id: int
    role: str = Field(default="viewer", pattern=r"^(viewer|dj|moderator|admin)$")


class GuildAccessResponse(BaseModel):
    id: int
    user_id: int
    guild_id: int
    role: str
    created_at: datetime
    guild: GuildResponse | None = None

    model_config = {"from_attributes": True}


class ServerSettingsUpdate(BaseModel):
    default_text_channel_id: str | None = None
    default_voice_channel_id: str | None = None
    dj_role_id: str | None = None
    autoplay_enabled: bool | None = None
    default_volume: int | None = Field(None, ge=0, le=200)
    loop_mode: str | None = Field(None, pattern=r"^(off|track|queue)$")
    max_queue_size: int | None = Field(None, ge=1, le=500)
    max_song_duration: int | None = Field(None, ge=1)
    restricted_mode: bool | None = None


class ServerSettingsResponse(BaseModel):
    id: int
    guild_id: int
    default_text_channel_id: str | None = None
    default_voice_channel_id: str | None = None
    dj_role_id: str | None = None
    autoplay_enabled: bool
    default_volume: int
    loop_mode: str
    max_queue_size: int | None = None
    max_song_duration: int | None = None
    restricted_mode: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class GuildStatsResponse(BaseModel):
    total_playbacks: int
    total_playlists: int
    total_users: int
    total_commands: int
