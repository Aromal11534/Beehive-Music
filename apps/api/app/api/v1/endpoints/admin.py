from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.core.database import get_db
from app.api.v1.deps import get_admin_user
from app.models.user import User
from app.models.audit import AuditLog
from app.models.history import PlayHistory
from app.models.playlist import PlaylistTrack, Playlist
from app.models.favorite import Favorite

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/wipe-data")
async def wipe_system_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
) -> Dict[str, Any]:
    """Wipe non-critical system data like logs, history, playlists, and favorites."""
    
    # Track deleted row counts
    counts = {}
    
    # 1. Audit Logs
    result = await db.execute(delete(AuditLog))
    counts["audit_logs"] = result.rowcount
    
    # 2. Play History
    result = await db.execute(delete(PlayHistory))
    counts["play_history"] = result.rowcount
    
    # 3. Favorites
    result = await db.execute(delete(Favorite))
    counts["favorites"] = result.rowcount
    
    # 4. Playlist Tracks
    result = await db.execute(delete(PlaylistTrack))
    counts["playlist_tracks"] = result.rowcount
    
    # 5. Playlists
    result = await db.execute(delete(Playlist))
    counts["playlists"] = result.rowcount
    
    await db.commit()
    
    return {
        "message": "System data successfully wiped.",
        "deleted_counts": counts
    }
