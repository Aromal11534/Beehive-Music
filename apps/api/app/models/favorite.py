"""User favorites model."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.base import Base


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    track_title = Column(String(512), nullable=False)
    track_author = Column(String(255), nullable=True)
    track_url = Column(String(1024), nullable=False)
    track_identifier = Column(String(255), nullable=True)
    source = Column(String(64), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    artwork_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="favorites")

    def __repr__(self):
        return f"<Favorite(id={self.id}, title='{self.track_title}')>"
