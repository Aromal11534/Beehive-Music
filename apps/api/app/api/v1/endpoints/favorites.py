"""Favorites endpoints."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.schemas.favorite import FavoriteCreate, FavoriteResponse
from app.schemas.common import MessageResponse
from app.services.favorite_service import FavoriteService
from app.models.user import User

router = APIRouter(prefix="/favorites", tags=["Favorites"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[FavoriteResponse])
async def list_favorites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's favorites."""
    service = FavoriteService(db)
    return await service.list_favorites(current_user.id)


@router.post("", response_model=FavoriteResponse, status_code=201)
async def add_favorite(
    data: FavoriteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a track to favorites."""
    service = FavoriteService(db)
    return await service.add_favorite(current_user.id, data)


@router.delete("/{favorite_id}", response_model=MessageResponse)
async def remove_favorite(
    favorite_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a track from favorites."""
    service = FavoriteService(db)
    await service.remove_favorite(current_user.id, favorite_id)
    return {"message": "Removed from favorites"}


from pydantic import BaseModel

class FavoriteImportRequest(BaseModel):
    url: str

@router.post("/import", response_model=list[FavoriteResponse], status_code=201)
async def import_favorites(
    data: FavoriteImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import tracks from Spotify or YouTube Music into favorites."""
    from app.services.importer import importer
    from fastapi import HTTPException
    
    try:
        imported_data = await importer.fetch_playlist(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    service = FavoriteService(db)
    added_favorites = []
    
    for track_data in imported_data["tracks"]:
        try:
            async with db.begin_nested():
                fav_create = FavoriteCreate(**track_data)
                fav = await service.add_favorite(current_user.id, fav_create)
            added_favorites.append(fav)
        except Exception as exc:
            logger.warning(
                "Skipped favorite import track title=%r error=%s",
                track_data.get("track_title"),
                type(exc).__name__,
            )
            
    return await service.list_favorites(current_user.id)
