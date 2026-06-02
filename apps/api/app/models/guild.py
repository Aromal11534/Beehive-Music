"""Discord guild, user access, and server settings models."""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.core.base import Base


class DiscordGuild(Base):
    __tablename__ = "discord_guilds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    discord_guild_id = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    icon_url = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user_access = relationship("UserGuildAccess", back_populates="guild", cascade="all, delete-orphan")
    settings = relationship("ServerSettings", back_populates="guild", uselist=False, cascade="all, delete-orphan")
    playlists = relationship("Playlist", back_populates="owner_guild", foreign_keys="Playlist.owner_guild_id")

    def __repr__(self):
        return f"<DiscordGuild(id={self.id}, discord_id='{self.discord_guild_id}')>"


class UserGuildAccess(Base):
    __tablename__ = "user_guild_access"
    __table_args__ = (
        UniqueConstraint("user_id", "guild_id", name="uq_user_guild"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    guild_id = Column(Integer, ForeignKey("discord_guilds.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(32), default="viewer", nullable=False)  # viewer, dj, moderator, admin
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="guild_access")
    guild = relationship("DiscordGuild", back_populates="user_access")

    def __repr__(self):
        return f"<UserGuildAccess(user_id={self.user_id}, guild_id={self.guild_id}, role='{self.role}')>"


class ServerSettings(Base):
    __tablename__ = "server_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    guild_id = Column(Integer, ForeignKey("discord_guilds.id", ondelete="CASCADE"), unique=True, nullable=False)
    default_text_channel_id = Column(String(20), nullable=True)
    default_voice_channel_id = Column(String(20), nullable=True)
    dj_role_id = Column(String(20), nullable=True)
    autoplay_enabled = Column(Boolean, default=False, nullable=False)
    default_volume = Column(Integer, default=80, nullable=False)
    loop_mode = Column(String(16), default="off", nullable=False)  # off, track, queue
    max_queue_size = Column(Integer, nullable=True, default=500)
    max_song_duration = Column(Integer, nullable=True)  # seconds
    restricted_mode = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    guild = relationship("DiscordGuild", back_populates="settings")

    def __repr__(self):
        return f"<ServerSettings(guild_id={self.guild_id})>"
