"""Session management endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.schemas.common import MessageResponse
from app.services.auth_service import AuthService
from app.models.user import User


class SessionResponse(BaseModel):
    id: int
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}


router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List active sessions for the current user."""
    service = AuthService(db)
    sessions = await service.get_active_sessions(current_user.id)
    return sessions


@router.delete("/{session_id}", response_model=MessageResponse)
async def revoke_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific session."""
    service = AuthService(db)
    await service.revoke_session(session_id, current_user.id)
    return {"message": "Session revoked"}
