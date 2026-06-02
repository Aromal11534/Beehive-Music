"""Favorites endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.schemas.favorite import FavoriteCreate, FavoriteResponse
from app.schemas.common import MessageResponse
from app.services.favorite_service import FavoriteService
from app.models.user import User

router = APIRouter(prefix="/favorites", tags=["Favorites"])


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
