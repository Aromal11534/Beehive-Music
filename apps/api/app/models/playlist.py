"""Playlist and playlist track models."""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey
)
from sqlalchemy.orm import relationship
from app.core.base import Base


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    owner_guild_id = Column(Integer, ForeignKey("discord_guilds.id", ondelete="SET NULL"), nullable=True, index=True)
    playlist_type = Column(String(16), default="personal", nullable=False)  # personal, server, shared
    is_public = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    owner_user = relationship("User", back_populates="playlists", foreign_keys=[owner_user_id])
    owner_guild = relationship("DiscordGuild", back_populates="playlists", foreign_keys=[owner_guild_id])
    tracks = relationship("PlaylistTrack", back_populates="playlist", cascade="all, delete-orphan",
                          order_by="PlaylistTrack.position")

    def __repr__(self):
        return f"<Playlist(id={self.id}, name='{self.name}', type='{self.playlist_type}')>"


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)
    track_title = Column(String(512), nullable=False)
    track_author = Column(String(255), nullable=True)
    track_url = Column(String(1024), nullable=False)
    track_identifier = Column(String(255), nullable=True)
    source = Column(String(64), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    artwork_url = Column(String(1024), nullable=True)
    added_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    playlist = relationship("Playlist", back_populates="tracks")

    def __repr__(self):
        return f"<PlaylistTrack(id={self.id}, title='{self.track_title}')>"
