"""Play history endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user, require_guild_access_by_id
from app.schemas.history import PlayHistoryResponse
from app.services.history_service import HistoryService
from app.models.user import User

router = APIRouter(prefix="/history", tags=["History"])


@router.get("", response_model=list[PlayHistoryResponse])
async def get_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's play history."""
    service = HistoryService(db)
    return await service.get_user_history(current_user.id, limit, offset)


@router.get("/guild/{guild_id}", response_model=list[PlayHistoryResponse])
async def get_guild_history(
    guild_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get play history for a guild."""
    await require_guild_access_by_id(guild_id, current_user, db)
    service = HistoryService(db)
    return await service.get_guild_history(guild_id, limit, offset)
