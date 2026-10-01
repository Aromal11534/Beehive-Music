"""Session endpoints for Discord-authenticated users."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_client_ip, get_current_user
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.auth import TokenRefreshRequest, TokenRefreshResponse
from app.schemas.common import MessageResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/refresh", response_model=TokenRefreshResponse)
@limiter.limit("30/minute")
async def refresh_tokens(
    body: TokenRefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Rotate tokens for an existing Discord-authenticated session."""
    service = AuthService(db)
    return await service.refresh_tokens(
        body.refresh_token,
        get_client_ip(request),
        request.headers.get("user-agent"),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    body: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Revoke the current refresh session."""
    await AuthService(db).logout(body.refresh_token)
    return {"message": "Logged out successfully"}


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke every refresh session for the current user."""
    await AuthService(db).logout_all(current_user.id)
    return {"message": "All sessions revoked"}
