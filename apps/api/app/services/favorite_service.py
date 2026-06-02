"""Favorites service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ConflictError
from app.models.favorite import Favorite
from app.schemas.favorite import FavoriteCreate


class FavoriteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_favorite(self, user_id: int, data: FavoriteCreate) -> Favorite:
        # Check for duplicate
        existing = await self.db.execute(
            select(Favorite).where(
                Favorite.user_id == user_id,
                Favorite.track_url == data.track_url,
            )
        )
        if existing.scalar_one_or_none():
            raise ConflictError("Track already in favorites")

        fav = Favorite(user_id=user_id, **data.model_dump())
        self.db.add(fav)
        await self.db.flush()
        return fav

    async def remove_favorite(self, user_id: int, favorite_id: int):
        result = await self.db.execute(
            select(Favorite).where(Favorite.id == favorite_id, Favorite.user_id == user_id)
        )
        fav = result.scalar_one_or_none()
        if not fav:
            raise NotFoundError("Favorite not found")
        await self.db.delete(fav)
        await self.db.flush()

    async def list_favorites(self, user_id: int) -> list[Favorite]:
        result = await self.db.execute(
            select(Favorite).where(Favorite.user_id == user_id).order_by(Favorite.created_at.desc())
        )
        return list(result.scalars().all())
