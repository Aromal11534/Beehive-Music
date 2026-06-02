"""Authentication endpoints — login, MFA, refresh, logout."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.api.v1.deps import get_current_user, get_client_ip
from app.schemas.auth import (
    LoginRequest, LoginResponse, MfaVerifyRequest,
    TokenRefreshRequest, TokenRefreshResponse, PasswordChangeRequest,
)
from app.schemas.common import MessageResponse
from app.services.auth_service import AuthService
from app.services.user_service import UserService
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with username and password. Returns tokens or MFA challenge."""
    service = AuthService(db)
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")
    result = await service.login(body.username, body.password, ip, ua)
    return result


@router.post("/mfa/verify", response_model=LoginResponse)
@limiter.limit("10/minute")
async def verify_mfa(
    body: MfaVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Verify MFA code after password authentication."""
    service = AuthService(db)
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")
    result = await service.verify_mfa(body.mfa_token, body.code, ip, ua)
    return result


@router.post("/refresh", response_model=TokenRefreshResponse)
@limiter.limit("30/minute")
async def refresh_tokens(
    body: TokenRefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access and refresh tokens."""
    service = AuthService(db)
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")
    result = await service.refresh_tokens(body.refresh_token, ip, ua)
    return result


@router.post("/logout", response_model=MessageResponse)
async def logout(
    body: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Logout and revoke the current session."""
    service = AuthService(db)
    await service.logout(body.refresh_token)
    return {"message": "Logged out successfully"}


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Logout from all sessions."""
    service = AuthService(db)
    await service.logout_all(current_user.id)
    return {"message": "All sessions revoked"}


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password."""
    service = UserService(db)
    await service.change_password(current_user.id, body.current_password, body.new_password)
    return {"message": "Password changed successfully"}
