"""Play history schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class PlayHistoryCreate(BaseModel):
    guild_id: int | None = None
    track_title: str = Field(..., max_length=512)
    track_author: str | None = Field(None, max_length=255)
    track_url: str = Field(..., max_length=1024)
    track_identifier: str | None = Field(None, max_length=255)
    source: str | None = Field(None, max_length=64)
    duration_ms: int | None = None
    requested_by_user_id: int | None = None


class PlayHistoryResponse(BaseModel):
    id: int
    user_id: int | None = None
    guild_id: int | None = None
    track_title: str
    track_author: str | None = None
    track_url: str
    track_identifier: str | None = None
    source: str | None = None
    duration_ms: int | None = None
    played_at: datetime
    requested_by_user_id: int | None = None

    model_config = {"from_attributes": True}
