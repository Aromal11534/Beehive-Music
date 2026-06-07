"""Playlist schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class PlaylistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    playlist_type: str = Field(default="personal", pattern=r"^(personal|server|shared)$")
    owner_guild_id: int | None = None
    is_public: bool = False

class PlaylistImportRequest(BaseModel):
    url: str = Field(..., max_length=1024)
    playlist_type: str = Field(default="personal", pattern=r"^(personal|server)$")
    owner_guild_id: int | None = None


class PlaylistUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    is_public: bool | None = None


class PlaylistTrackAdd(BaseModel):
    track_title: str = Field(..., max_length=512)
    track_author: str | None = Field(None, max_length=255)
    track_url: str = Field(..., max_length=1024)
    track_identifier: str | None = Field(None, max_length=255)
    source: str | None = Field(None, max_length=64)
    duration_ms: int | None = None
    artwork_url: str | None = Field(None, max_length=1024)
    position: int | None = None


class PlaylistTrackResponse(BaseModel):
    id: int
    playlist_id: int
    position: int
    track_title: str
    track_author: str | None = None
    track_url: str
    track_identifier: str | None = None
    source: str | None = None
    duration_ms: int | None = None
    artwork_url: str | None = None
    added_by_user_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PlaylistResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    owner_user_id: int | None = None
    owner_guild_id: int | None = None
    playlist_type: str
    is_public: bool
    track_count: int = 0
    top_artworks: list[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlaylistDetailResponse(PlaylistResponse):
    tracks: list[PlaylistTrackResponse] = []
