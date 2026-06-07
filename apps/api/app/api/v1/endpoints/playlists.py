"""Playlist endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.schemas.playlist import (
    PlaylistCreate, PlaylistUpdate, PlaylistResponse,
    PlaylistDetailResponse, PlaylistTrackAdd, PlaylistTrackResponse,
    PlaylistImportRequest, PlaylistAppendRequest
)
from app.schemas.common import MessageResponse
from app.services.playlist_service import PlaylistService
from app.models.user import User

router = APIRouter(prefix="/playlists", tags=["Playlists"])


@router.get("", response_model=list[PlaylistResponse])
async def list_my_playlists(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's playlists."""
    service = PlaylistService(db)
    playlists = await service.list_user_playlists(current_user.id)
    return [PlaylistResponse(
        **{c.name: getattr(p, c.name) for c in p.__table__.columns},
        track_count=getattr(p, 'track_count', 0),
        top_artworks=getattr(p, 'top_artworks', []),
    ) for p in playlists]


@router.post("", response_model=PlaylistResponse, status_code=201)
async def create_playlist(
    data: PlaylistCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new playlist."""
    service = PlaylistService(db)
    playlist = await service.create_playlist(data, current_user.id)
    return PlaylistResponse(
        **{c.name: getattr(playlist, c.name) for c in playlist.__table__.columns},
        track_count=0,
    )


@router.post("/import", response_model=PlaylistResponse, status_code=201)
async def import_playlist(
    data: PlaylistImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import a playlist from Spotify or YouTube Music."""
    from app.services.importer import importer
    from fastapi import HTTPException
    
    try:
        imported_data = await importer.fetch_playlist(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    service = PlaylistService(db)
    
    # Create the playlist
    playlist_create = PlaylistCreate(
        name=imported_data["name"],
        description=imported_data["description"],
        playlist_type=data.playlist_type,
        owner_guild_id=data.owner_guild_id,
        is_public=False
    )
    playlist = await service.create_playlist(playlist_create, current_user.id)
    
    # Add all tracks
    for track_data in imported_data["tracks"]:
        try:
            track_add = PlaylistTrackAdd(**track_data)
            await service.add_track(playlist.id, track_add, current_user.id, current_user.is_admin)
        except Exception as e:
            print(f"Failed to add track {track_data.get('track_title')}: {e}")
            pass # Skip invalid tracks
            
    return PlaylistResponse(
        **{c.name: getattr(playlist, c.name) for c in playlist.__table__.columns},
        track_count=len(imported_data["tracks"]),
    )


@router.post("/{playlist_id}/import", response_model=PlaylistResponse, status_code=201)
async def append_playlist(
    playlist_id: int,
    data: PlaylistAppendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Append a playlist from Spotify or YouTube Music to an existing playlist."""
    from app.services.importer import importer
    from fastapi import HTTPException
    
    # First verify the playlist exists and the user can modify it
    service = PlaylistService(db)
    playlist = await service.get_playlist(playlist_id)
    await service._ensure_can_modify(playlist, current_user.id, current_user.is_admin)

    try:
        imported_data = await importer.fetch_playlist(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    added_count = 0
    # Add all tracks
    for track_data in imported_data["tracks"]:
        try:
            track_add = PlaylistTrackAdd(**track_data)
            await service.add_track(playlist_id, track_add, current_user.id, current_user.is_admin)
            added_count += 1
        except Exception as e:
            # Duplicate tracks will throw an exception which we silently ignore to deduplicate
            pass

    # Re-fetch playlist to get updated track count
    playlist = await service.get_playlist(playlist_id)
    return PlaylistResponse(
        **{c.name: getattr(playlist, c.name) for c in playlist.__table__.columns},
        track_count=len(playlist.tracks),
    )



@router.get("/{playlist_id}", response_model=PlaylistDetailResponse)
async def get_playlist(
    playlist_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get playlist with tracks."""
    service = PlaylistService(db)
    playlist = await service.get_playlist_for_user(playlist_id, current_user.id, current_user.is_admin)
    return PlaylistDetailResponse(
        **{c.name: getattr(playlist, c.name) for c in playlist.__table__.columns},
        track_count=len(playlist.tracks),
        tracks=playlist.tracks,
    )


@router.patch("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(
    playlist_id: int,
    data: PlaylistUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a playlist."""
    service = PlaylistService(db)
    playlist = await service.update_playlist(playlist_id, data, current_user.id, current_user.is_admin)
    return PlaylistResponse(
        **{c.name: getattr(playlist, c.name) for c in playlist.__table__.columns},
        track_count=len(playlist.tracks) if playlist.tracks else 0,
    )


@router.delete("/{playlist_id}", response_model=MessageResponse)
async def delete_playlist(
    playlist_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a playlist."""
    service = PlaylistService(db)
    await service.delete_playlist(playlist_id, current_user.id, current_user.is_admin)
    return {"message": "Playlist deleted"}


@router.post("/{playlist_id}/tracks", response_model=PlaylistTrackResponse, status_code=201)
async def add_track(
    playlist_id: int,
    data: PlaylistTrackAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a track to a playlist."""
    service = PlaylistService(db)
    return await service.add_track(playlist_id, data, current_user.id, current_user.is_admin)


@router.delete("/{playlist_id}/tracks/{track_id}", response_model=MessageResponse)
async def remove_track(
    playlist_id: int,
    track_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a track from a playlist."""
    service = PlaylistService(db)
    await service.remove_track(playlist_id, track_id, current_user.id, current_user.is_admin)
    return {"message": "Track removed"}


@router.put("/{playlist_id}/tracks/reorder", response_model=MessageResponse)
async def reorder_tracks(
    playlist_id: int,
    track_ids: list[int],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reorder tracks in a playlist."""
    service = PlaylistService(db)
    await service.reorder_tracks(playlist_id, track_ids, current_user.id, current_user.is_admin)
    return {"message": "Tracks reordered"}
