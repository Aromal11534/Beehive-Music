"""FastAPI dependency injection utilities."""

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.exceptions import AuthenticationError, AuthorizationError, NotFoundError
from app.models.guild import DiscordGuild, UserGuildAccess
from app.models.user import User
from app.services.user_service import UserService


async def get_current_user(
    request: Request,
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from the Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationError("Missing or invalid authorization header")

    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
    except Exception:
        raise AuthenticationError("Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise AuthenticationError("Invalid token payload")

    user_service = UserService(db)
    try:
        user = await user_service.get_user(int(user_id))
    except Exception:
        raise AuthenticationError("User not found")

    if not user.is_active:
        raise AuthenticationError("Account is deactivated")

    return user


async def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is an admin."""
    if not current_user.is_admin:
        raise AuthorizationError("Admin access required")
    return current_user


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def require_guild_access_by_discord_id(
    discord_guild_id: str,
    current_user: User,
    db: AsyncSession,
) -> DiscordGuild:
    """Ensure a user can access a Discord guild identified by its Discord ID."""
    result = await db.execute(
        select(DiscordGuild).where(DiscordGuild.discord_guild_id == discord_guild_id)
    )
    guild = result.scalar_one_or_none()
    if not guild:
        raise NotFoundError("Guild not found")

    if current_user.is_admin:
        return guild

    access_result = await db.execute(
        select(UserGuildAccess).where(
            UserGuildAccess.user_id == current_user.id,
            UserGuildAccess.guild_id == guild.id,
        )
    )
    if not access_result.scalar_one_or_none():
        raise AuthorizationError("You don't have access to this guild")

    return guild
