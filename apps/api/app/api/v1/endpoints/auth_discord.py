"""Discord OAuth login and guild-access reconciliation."""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_client_ip, get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.guild import DiscordGuild, UserGuildAccess
from app.models.user import User
from app.schemas.auth import LoginResponse
from app.services.auth_service import AuthService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/discord", tags=["auth-discord"])

DISCORD_PERMISSION_ADMINISTRATOR = 0x8
DISCORD_PERMISSION_MANAGE_GUILD = 0x20


class DiscordOAuthRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=512)
    redirect_uri: str = Field(..., min_length=1, max_length=2048)


def _discord_guild_role(guild: dict[str, Any]) -> str:
    """Map current Discord permissions to Beehive guild access."""
    if guild.get("owner"):
        return "admin"

    try:
        permissions = int(guild.get("permissions") or 0)
    except (TypeError, ValueError):
        permissions = 0

    if permissions & (DISCORD_PERMISSION_ADMINISTRATOR | DISCORD_PERMISSION_MANAGE_GUILD):
        return "admin"
    return "viewer"


def _validate_redirect_uri(redirect_uri: str) -> None:
    settings = get_settings()
    if redirect_uri != settings.allowed_discord_redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Discord OAuth redirect URI.",
        )


async def _exchange_discord_code(
    request: DiscordOAuthRequest,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Exchange a one-time code and fetch the identity plus current guild list."""
    settings = get_settings()
    _validate_redirect_uri(request.redirect_uri)

    if not settings.discord_client_id or not settings.discord_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Discord OAuth is not configured on the server.",
        )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_response = await client.post(
                "https://discord.com/api/oauth2/token",
                data={
                    "client_id": settings.discord_client_id,
                    "client_secret": settings.discord_client_secret,
                    "grant_type": "authorization_code",
                    "code": request.code,
                    "redirect_uri": request.redirect_uri,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if token_response.status_code != 200:
                logger.warning(
                    "Discord token exchange failed with status=%s",
                    token_response.status_code,
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to exchange Discord authorization code.",
                )

            access_token = token_response.json().get("access_token")
            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Discord did not return an access token.",
                )

            headers = {"Authorization": f"Bearer {access_token}"}
            user_response, guilds_response = await asyncio_gather_responses(
                client,
                headers,
            )
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Discord OAuth request failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Discord OAuth is temporarily unavailable.",
        ) from exc

    if user_response.status_code != 200 or guilds_response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to fetch Discord account details.",
        )

    try:
        identity = user_response.json()
        guilds = guilds_response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Discord returned an invalid response.",
        ) from exc
    if not isinstance(identity, dict) or not isinstance(guilds, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Discord returned an invalid response.",
        )
    return identity, guilds


async def asyncio_gather_responses(
    client: httpx.AsyncClient,
    headers: dict[str, str],
) -> tuple[httpx.Response, httpx.Response]:
    """Fetch independent Discord resources concurrently."""
    import asyncio

    user_response, guilds_response = await asyncio.gather(
        client.get("https://discord.com/api/users/@me", headers=headers),
        client.get("https://discord.com/api/users/@me/guilds", headers=headers),
    )
    return user_response, guilds_response


async def _reconcile_guild_access(
    db: AsyncSession,
    user: User,
    discord_guilds: list[dict[str, Any]],
) -> int:
    """Make stored access exactly match the user's current shared Discord guilds."""
    guild_roles = {
        str(guild["id"]): _discord_guild_role(guild)
        for guild in discord_guilds
        if guild.get("id")
    }

    bot_guilds: list[DiscordGuild] = []
    if guild_roles:
        result = await db.execute(
            select(DiscordGuild).where(
                DiscordGuild.discord_guild_id.in_(guild_roles.keys())
            )
        )
        bot_guilds = list(result.scalars().all())

    existing_result = await db.execute(
        select(UserGuildAccess).where(UserGuildAccess.user_id == user.id)
    )
    existing_access = {
        access.guild_id: access for access in existing_result.scalars().all()
    }
    shared_guild_ids = {guild.id for guild in bot_guilds}

    for guild in bot_guilds:
        desired_role = guild_roles[guild.discord_guild_id]
        access = existing_access.get(guild.id)
        if access is None:
            db.add(
                UserGuildAccess(
                    user_id=user.id,
                    guild_id=guild.id,
                    role=desired_role,
                )
            )
        else:
            # Discord is authoritative: upgrades and downgrades are both applied.
            access.role = desired_role

    # Discord-only access is authoritative; remove guilds the user left or lost.
    for guild_id, access in existing_access.items():
        if guild_id not in shared_guild_ids:
            await db.delete(access)

    await db.flush()
    return len(bot_guilds)


@router.post("/login", response_model=LoginResponse)
async def login_with_discord(
    request: DiscordOAuthRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with Discord and reconcile guild access in one flow."""
    discord_user, discord_guilds = await _exchange_discord_code(request)
    discord_id = str(discord_user.get("id") or "")
    username = str(discord_user.get("username") or "")
    if not discord_id or not username:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Discord account details are incomplete.",
        )

    # Only retain an email that Discord explicitly says it verified. It is never
    # used as an automatic account-linking key.
    email = (
        discord_user.get("email")
        if discord_user.get("verified") is True
        else None
    )
    service = AuthService(db)
    login_result, user = await service.login_with_discord(
        discord_id=discord_id,
        email=email,
        username=username,
        ip=get_client_ip(req),
        user_agent=req.headers.get("user-agent"),
    )
    await _reconcile_guild_access(db, user, discord_guilds)
    return login_result


@router.post("/sync")
async def sync_discord_account(
    request: DiscordOAuthRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Refresh Discord identity and reconcile the complete guild access set."""
    discord_user, discord_guilds = await _exchange_discord_code(request)
    discord_id = str(discord_user.get("id") or "")
    if not discord_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Discord account details are incomplete.",
        )

    if current_user.discord_id and current_user.discord_id != discord_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This session belongs to a different Discord account.",
        )

    linked_result = await db.execute(
        select(User).where(
            User.discord_id == discord_id,
            User.id != current_user.id,
        )
    )
    if linked_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Discord account is already linked.",
        )

    current_user.discord_id = discord_id
    synced_count = await _reconcile_guild_access(db, current_user, discord_guilds)
    return {
        "message": f"Discord access refreshed for {synced_count} server(s).",
        "discord_username": discord_user.get("username"),
        "synced_guilds": synced_count,
    }
