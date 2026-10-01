"""User management endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user, get_admin_user
from app.schemas.user import (
    AdminPasswordResetRequest,
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    UserProfileUpdate,
)
from app.schemas.common import MessageResponse
from app.services.user_service import UserService
from app.models.user import User

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get the current user's profile."""
    return UserResponse(
        **{c.name: getattr(current_user, c.name) for c in current_user.__table__.columns},
        mfa_enabled=current_user.mfa.is_enabled if current_user.mfa else False,
    )


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's profile."""
    service = UserService(db)
    user = await service.update_profile(current_user.id, data)
    return UserResponse(
        **{c.name: getattr(user, c.name) for c in user.__table__.columns},
        mfa_enabled=user.mfa.is_enabled if user.mfa else False,
    )


# ── Admin Endpoints ──────────────────────────────────────
@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)."""
    service = UserService(db)
    users, total = await service.list_users(page, page_size, search)
    user_responses = []
    for u in users:
        user_responses.append(UserResponse(
            **{c.name: getattr(u, c.name) for c in u.__table__.columns},
            mfa_enabled=u.mfa.is_enabled if u.mfa else False,
        ))
    return UserListResponse(users=user_responses, total=total, page=page, page_size=page_size)


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    data: UserCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (admin only)."""
    service = UserService(db)
    user = await service.create_user(data)
    return UserResponse(
        **{c.name: getattr(user, c.name) for c in user.__table__.columns},
        mfa_enabled=False,
    )


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a user by ID (admin only)."""
    service = UserService(db)
    user = await service.get_user(user_id)
    return UserResponse(
        **{c.name: getattr(user, c.name) for c in user.__table__.columns},
        mfa_enabled=user.mfa.is_enabled if user.mfa else False,
    )


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a user (admin only)."""
    service = UserService(db)
    user = await service.update_user(user_id, data)
    return UserResponse(
        **{c.name: getattr(user, c.name) for c in user.__table__.columns},
        mfa_enabled=user.mfa.is_enabled if user.mfa else False,
    )


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user (admin only)."""
    service = UserService(db)
    await service.delete_user(user_id)
    return {"message": "User deleted"}


@router.post("/{user_id}/reset-password", response_model=MessageResponse)
async def admin_reset_password(
    user_id: int,
    body: AdminPasswordResetRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Reset a user's password (admin only)."""
    service = UserService(db)
    await service.reset_password(user_id, body.new_password)
    return {"message": "Password reset successfully"}
