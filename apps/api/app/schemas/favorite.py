"""Favorite schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class FavoriteCreate(BaseModel):
    track_title: str = Field(..., max_length=512)
    track_author: str | None = Field(None, max_length=255)
    track_url: str = Field(..., max_length=1024)
    track_identifier: str | None = Field(None, max_length=255)
    source: str | None = Field(None, max_length=64)
    duration_ms: int | None = None
    artwork_url: str | None = Field(None, max_length=1024)


class FavoriteResponse(BaseModel):
    id: int
    user_id: int
    track_title: str
    track_author: str | None = None
    track_url: str
    track_identifier: str | None = None
    source: str | None = None
    duration_ms: int | None = None
    artwork_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
