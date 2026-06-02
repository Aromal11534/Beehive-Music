"""Play history / recently played model."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.core.base import Base


class PlayHistory(Base):
    __tablename__ = "play_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    guild_id = Column(Integer, ForeignKey("discord_guilds.id", ondelete="SET NULL"), nullable=True, index=True)
    track_title = Column(String(512), nullable=False)
    track_author = Column(String(255), nullable=True)
    track_url = Column(String(1024), nullable=False)
    track_identifier = Column(String(255), nullable=True)
    source = Column(String(64), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    played_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    requested_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    def __repr__(self):
        return f"<PlayHistory(id={self.id}, title='{self.track_title}')>"
