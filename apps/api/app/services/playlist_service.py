"""Playlist management service."""

from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, AuthorizationError
from app.models.guild import UserGuildAccess
from app.models.history import PlayHistory
from app.models.playlist import Playlist, PlaylistTrack
from app.schemas.playlist import PlaylistCreate, PlaylistUpdate, PlaylistTrackAdd


class PlaylistService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_playlist(self, data: PlaylistCreate, user_id: int) -> Playlist:
        if data.playlist_type == "server":
            if data.owner_guild_id is None:
                raise AuthorizationError("Server playlist requires a guild")
            access = await self._get_guild_access(user_id, data.owner_guild_id)
            if not access or access.role not in {"admin", "moderator", "dj"}:
                raise AuthorizationError("You don't have permission to create server playlists")

        playlist = Playlist(
            name=data.name,
            description=data.description,
            playlist_type=data.playlist_type,
            is_public=data.is_public,
            owner_user_id=user_id if data.playlist_type == "personal" else None,
            owner_guild_id=data.owner_guild_id if data.playlist_type == "server" else None,
        )
        self.db.add(playlist)
        await self.db.flush()
        return playlist

    async def get_playlist(self, playlist_id: int) -> Playlist:
        result = await self.db.execute(
            select(Playlist).options(selectinload(Playlist.tracks)).where(Playlist.id == playlist_id)
        )
        playlist = result.scalar_one_or_none()
        if not playlist:
            raise NotFoundError("Playlist not found")
        return playlist

    async def get_playlist_for_user(self, playlist_id: int, user_id: int, is_admin: bool = False) -> Playlist:
        playlist = await self.get_playlist(playlist_id)
        await self._ensure_can_view(playlist, user_id, is_admin)
        return playlist

    async def list_user_playlists(self, user_id: int):
        result = await self.db.execute(
            select(Playlist).where(Playlist.owner_user_id == user_id).order_by(Playlist.updated_at.desc())
        )
        playlists = list(result.scalars().all())
        await self._populate_playlist_metadata(playlists)
        return playlists

    async def list_guild_playlists(self, guild_id: int):
        result = await self.db.execute(
            select(Playlist).where(
                Playlist.owner_guild_id == guild_id,
                Playlist.playlist_type == "server",
            ).order_by(Playlist.updated_at.desc())
        )
        playlists = list(result.scalars().all())
        await self._populate_playlist_metadata(playlists)
        return playlists

    async def _populate_playlist_metadata(self, playlists: list[Playlist]):
        for p in playlists:
            count_result = await self.db.execute(
                select(func.count()).where(PlaylistTrack.playlist_id == p.id)
            )
            p.track_count = count_result.scalar() or 0
            
            artwork_query = (
                select(PlaylistTrack.artwork_url)
                .outerjoin(PlayHistory, PlayHistory.track_url == PlaylistTrack.track_url)
                .where(PlaylistTrack.playlist_id == p.id, PlaylistTrack.artwork_url.isnot(None))
                .group_by(PlaylistTrack.artwork_url)
                .order_by(func.count(PlayHistory.id).desc(), func.min(PlaylistTrack.position).asc())
                .limit(4)
            )
            artwork_result = await self.db.execute(artwork_query)
            p.top_artworks = list(artwork_result.scalars().all())

    async def update_playlist(self, playlist_id: int, data: PlaylistUpdate, user_id: int, is_admin: bool = False) -> Playlist:
        playlist = await self.get_playlist(playlist_id)
        await self._ensure_can_modify(playlist, user_id, is_admin)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(playlist, key, value)
        playlist.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return playlist

    async def delete_playlist(self, playlist_id: int, user_id: int, is_admin: bool = False):
        playlist = await self.get_playlist(playlist_id)
        await self._ensure_can_modify(playlist, user_id, is_admin)
        await self.db.delete(playlist)
        await self.db.flush()

    async def add_track(self, playlist_id: int, data: PlaylistTrackAdd, user_id: int, is_admin: bool = False) -> PlaylistTrack:
        playlist = await self.get_playlist(playlist_id)
        await self._ensure_can_modify(playlist, user_id, is_admin)

        # Check for duplicate
        dup_check = await self.db.execute(
            select(PlaylistTrack).where(
                PlaylistTrack.playlist_id == playlist_id,
                PlaylistTrack.track_url == data.track_url
            )
        )
        if dup_check.scalars().first():
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Track already exists in this playlist")

        # Get next position
        if data.position is not None:
            position = data.position
        else:
            result = await self.db.execute(
                select(func.max(PlaylistTrack.position)).where(PlaylistTrack.playlist_id == playlist_id)
            )
            max_pos = result.scalar() or 0
            position = max_pos + 1

        track = PlaylistTrack(
            playlist_id=playlist_id,
            position=position,
            track_title=data.track_title,
            track_author=data.track_author,
            track_url=data.track_url,
            track_identifier=data.track_identifier,
            source=data.source,
            duration_ms=data.duration_ms,
            artwork_url=data.artwork_url,
            added_by_user_id=user_id,
        )
        self.db.add(track)
        playlist.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return track

    async def remove_track(self, playlist_id: int, track_id: int, user_id: int, is_admin: bool = False):
        playlist = await self.get_playlist(playlist_id)
        await self._ensure_can_modify(playlist, user_id, is_admin)

        result = await self.db.execute(
            select(PlaylistTrack).where(
                PlaylistTrack.id == track_id,
                PlaylistTrack.playlist_id == playlist_id,
            )
        )
        track = result.scalar_one_or_none()
        if not track:
            raise NotFoundError("Track not found in playlist")
        await self.db.delete(track)
        await self.db.flush()

    async def reorder_tracks(self, playlist_id: int, track_ids: list[int], user_id: int, is_admin: bool = False):
        """Reorder tracks by providing the list of track IDs in desired order."""
        playlist = await self.get_playlist(playlist_id)
        await self._ensure_can_modify(playlist, user_id, is_admin)

        for position, track_id in enumerate(track_ids):
            result = await self.db.execute(
                select(PlaylistTrack).where(
                    PlaylistTrack.id == track_id,
                    PlaylistTrack.playlist_id == playlist_id,
                )
            )
            track = result.scalar_one_or_none()
            if track:
                track.position = position
        await self.db.flush()

    async def _ensure_can_view(self, playlist: Playlist, user_id: int, is_admin: bool = False):
        if is_admin or playlist.is_public or playlist.owner_user_id == user_id:
            return
        if playlist.owner_guild_id and await self._get_guild_access(user_id, playlist.owner_guild_id):
            return
        raise AuthorizationError("You don't have permission to view this playlist")

    async def _ensure_can_modify(self, playlist: Playlist, user_id: int, is_admin: bool = False):
        if is_admin or playlist.owner_user_id == user_id:
            return
        if playlist.owner_guild_id:
            access = await self._get_guild_access(user_id, playlist.owner_guild_id)
            if access and access.role in {"admin", "moderator", "dj"}:
                return
        raise AuthorizationError("You don't have permission to modify this playlist")

    async def _get_guild_access(self, user_id: int, guild_id: int) -> UserGuildAccess | None:
        result = await self.db.execute(
            select(UserGuildAccess).where(
                UserGuildAccess.user_id == user_id,
                UserGuildAccess.guild_id == guild_id,
            )
        )
        return result.scalar_one_or_none()
