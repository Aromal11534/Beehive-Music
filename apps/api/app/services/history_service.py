"""Play history service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.history import PlayHistory
from app.schemas.history import PlayHistoryCreate


class HistoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(self, user_id: int | None, data: PlayHistoryCreate) -> PlayHistory:
        entry = PlayHistory(user_id=user_id, **data.model_dump())
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def get_user_history(self, user_id: int, limit: int = 50, offset: int = 0) -> list[PlayHistory]:
        result = await self.db.execute(
            select(PlayHistory)
            .where(PlayHistory.user_id == user_id)
            .order_by(PlayHistory.played_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get_guild_history(self, guild_id: int, limit: int = 50, offset: int = 0) -> list[PlayHistory]:
        result = await self.db.execute(
            select(PlayHistory)
            .where(PlayHistory.guild_id == guild_id)
            .order_by(PlayHistory.played_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())
