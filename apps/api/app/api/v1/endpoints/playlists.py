"""Playlist endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.schemas.playlist import (
    PlaylistCreate, PlaylistUpdate, PlaylistResponse,
    PlaylistDetailResponse, PlaylistTrackAdd, PlaylistTrackResponse,
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
