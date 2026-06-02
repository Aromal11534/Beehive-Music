import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session_factory
from app.schemas.favorite import FavoriteCreate
from app.services.favorite_service import FavoriteService

async def main():
    async with async_session_factory() as db:
        service = FavoriteService(db)
        data = FavoriteCreate(
            track_title="Test Title",
            track_author="Test Author",
            track_url="https://youtube.com/test",
            track_identifier="test_id",
            source="youtube",
            duration_ms=1000,
            artwork_url="https://example.com/art.png"
        )
        try:
            fav = await service.add_favorite(1, data)
            print(f"Added favorite: {fav.id}")
            await db.commit()
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
