"""Guild management and server settings endpoints."""

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import get_settings as get_app_settings
from app.core.exceptions import AuthenticationError
from app.api.v1.deps import get_current_user, get_admin_user
from app.schemas.guild import (
    GuildCreate, GuildUpdate, GuildResponse, GuildAccessCreate, GuildAccessResponse,
    ServerSettingsUpdate, ServerSettingsResponse, GuildStatsResponse,
)
from app.schemas.playlist import PlaylistResponse
from app.schemas.common import MessageResponse
from app.services.guild_service import GuildService
from app.models.user import User

router = APIRouter(prefix="/guilds", tags=["Guilds"])


class GuildSyncItem(BaseModel):
    discord_guild_id: str
    name: str | None = None
    icon_url: str | None = None


class GuildSyncRequest(BaseModel):
    guilds: list[GuildSyncItem]


@router.post("/sync")
async def sync_guilds(
    data: GuildSyncRequest,
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Internal endpoint for bot to sync guilds on startup."""
    settings = get_app_settings()
    internal_token = settings.internal_api_token or settings.jwt_secret_key
    expected_token = f"Bearer {internal_token}"
    if not authorization or authorization != expected_token:
        raise AuthenticationError("Invalid internal token")

    service = GuildService(db)
    synced = await service.sync_guilds([g.model_dump() for g in data.guilds])
    return {"synced": len(synced), "guilds": [g.discord_guild_id for g in synced]}


@router.get("", response_model=list[GuildResponse])
async def list_guilds(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all registered guilds (admin only)."""
    service = GuildService(db)
    return await service.list_guilds()


@router.post("", response_model=GuildResponse, status_code=201)
async def create_guild(
    data: GuildCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Register a Discord guild (admin only)."""
    service = GuildService(db)
    return await service.create_guild(data.discord_guild_id, data.name, data.icon_url)


@router.get("/my", response_model=list[GuildAccessResponse])
async def my_guilds(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List guilds the current user has access to."""
    service = GuildService(db)
    return await service.get_user_guilds(current_user.id)


@router.get("/{guild_id}", response_model=GuildResponse)
async def get_guild(
    guild_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get guild details."""
    service = GuildService(db)
    return await service.get_guild(guild_id)


@router.patch("/{guild_id}", response_model=GuildResponse)
async def update_guild(
    guild_id: int,
    data: GuildUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update guild info (admin only)."""
    service = GuildService(db)
    return await service.update_guild(guild_id, data.name, data.icon_url)


@router.delete("/{guild_id}", response_model=MessageResponse)
async def delete_guild(
    guild_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a guild (admin only)."""
    service = GuildService(db)
    await service.delete_guild(guild_id)
    return {"message": "Guild deleted"}


@router.post("/{guild_id}/leave", response_model=MessageResponse)
async def leave_guild(
    guild_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tell the bot to leave a server and delete its data (Server admin or global admin)."""
    service = GuildService(db)
    
    # Check access
    if not current_user.is_admin:
        access = await service.check_access(current_user.id, guild_id)
        if not access or access.role != "admin":
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Not authorized to remove bot from this server")
            
    guild = await service.get_guild(guild_id)
    
    # Publish to Redis so the bot actually leaves the Discord server
    import json
    from app.core.redis import redis_client
    await redis_client.publish(
        f"web_command:{guild.discord_guild_id}",
        json.dumps({"action": "leave", "user_id": current_user.id}),
    )
    
    # Delete from database
    await service.delete_guild(guild_id)
    
    return {"message": "Bot is leaving the server"}


# ── Access Control ───────────────────────────────────────
@router.post("/access", response_model=GuildAccessResponse, status_code=201)
async def grant_access(
    data: GuildAccessCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Grant a user access to a guild (admin only)."""
    service = GuildService(db)
    return await service.grant_access(data.user_id, data.guild_id, data.role)


@router.delete("/access/{user_id}/{guild_id}", response_model=MessageResponse)
async def revoke_access(
    user_id: int,
    guild_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a user's guild access (admin only)."""
    service = GuildService(db)
    await service.revoke_access(user_id, guild_id)
    return {"message": "Access revoked"}


# ── Server Settings ──────────────────────────────────────
@router.get("/{guild_id}/settings", response_model=ServerSettingsResponse)
async def get_settings(
    guild_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get server settings for a guild."""
    service = GuildService(db)
    return await service.get_settings(guild_id)


@router.patch("/{guild_id}/settings", response_model=ServerSettingsResponse)
async def update_settings(
    guild_id: int,
    data: ServerSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update server settings."""
    service = GuildService(db)
    return await service.update_settings(guild_id, **data.model_dump(exclude_unset=True))


@router.get("/{guild_id}/playlists", response_model=list[PlaylistResponse])
async def list_guild_playlists(
    guild_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List server playlists for a guild."""
    service = GuildService(db)
    
    # Check access
    if not current_user.is_admin:
        access = await service.check_access(current_user.id, guild_id)
        if not access:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="No access to this guild")
            
    from app.services.playlist_service import PlaylistService
    playlist_service = PlaylistService(db)
    playlists = await playlist_service.list_guild_playlists(guild_id)
        
    return [
        {
            **{c.name: getattr(p, c.name) for c in p.__table__.columns},
            "track_count": getattr(p, 'track_count', 0),
            "top_artworks": getattr(p, 'top_artworks', []),
        }
        for p in playlists
    ]

@router.get("/{guild_id}/stats", response_model=GuildStatsResponse)
async def get_guild_stats(
    guild_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get statistics for a specific server (Admin only)."""
    service = GuildService(db)
    
    # Check access
    if not current_user.is_admin:
        access = await service.check_access(current_user.id, guild_id)
        if not access or access.role != "admin":
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="No admin access to this guild")
            
    from sqlalchemy import select, func
    from app.models.history import PlayHistory
    from app.models.playlist import Playlist
    
    # Get playbacks
    result_plays = await db.execute(select(func.count(PlayHistory.id)).where(PlayHistory.guild_id == guild_id))
    total_playbacks = result_plays.scalar() or 0
    
    # Get playlists
    result_playlists = await db.execute(select(func.count(Playlist.id)).where(Playlist.owner_guild_id == guild_id))
    total_playlists = result_playlists.scalar() or 0
    
    return GuildStatsResponse(
        total_playbacks=total_playbacks,
        total_playlists=total_playlists,
        total_users=0,  # Not tracked individually in db yet
        total_commands=0,  # Not tracked individually in db yet
    )
