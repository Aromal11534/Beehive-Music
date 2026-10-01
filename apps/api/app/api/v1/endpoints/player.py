"""Player state endpoints — read player state from Redis."""

import json
import logging
import uuid
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, get_db
from app.core.redis import redis_client
from app.core.security import decode_access_token
from app.api.v1.deps import get_current_user, require_guild_access_by_discord_id
from app.schemas.player import PlayerStateResponse, normalize_bot_state
from app.websocket.manager import ws_manager
from app.models.user import User
from app.models.guild import ServerSettings
from app.services.user_service import UserService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/player", tags=["Player"])


# ── Typed request models ────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    guild_id: str = Field(..., min_length=1, max_length=20)


class TrackData(BaseModel):
    """Validated track data from web panel — prevents untyped dict injection."""
    encoded: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=500)
    author: str = Field(default="Unknown", max_length=500)
    url: Optional[str] = Field(default=None, max_length=2048)
    identifier: Optional[str] = Field(default=None, max_length=500)
    duration: int = Field(default=0, ge=0)
    artwork_url: Optional[str] = Field(default=None, max_length=2048)
    source: Optional[str] = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def require_resolvable_reference(self):
        # Encoded Lavalink payloads alone cannot be policy-checked against fresh
        # source metadata, so web playback must provide a resolvable reference.
        if not self.url and not self.identifier:
            raise ValueError("Track URL or identifier is required")
        return self


class PlayAction(str, Enum):
    play = "play"
    queue = "queue"


class PlayRequest(BaseModel):
    guild_id: str = Field(..., min_length=1, max_length=20)
    track: Optional[TrackData] = None
    tracks: Optional[list[TrackData]] = Field(None, max_length=1000)
    action: PlayAction = PlayAction.play

    @model_validator(mode="after")
    def require_tracks(self):
        if self.track is None and not self.tracks:
            raise ValueError("A track or non-empty tracks list is required")
        if self.track is not None and self.tracks:
            raise ValueError("Provide either track or tracks, not both")
        return self


SIMPLE_WEB_COMMANDS = {
    "pause",
    "resume",
    "skip",
    "previous",
    "shuffle",
    "clear",
    "stop",
    "reload",
}


def _validated_web_command(payload: object) -> dict:
    """Allow only bounded player commands; destructive guild actions use REST."""
    if not isinstance(payload, dict):
        raise ValueError("Command must be an object")
    raw_request_id = payload.get("request_id")
    if not isinstance(raw_request_id, str):
        raise ValueError("Command request_id is required")
    try:
        request_id = str(uuid.UUID(raw_request_id))
    except (ValueError, AttributeError) as exc:
        raise ValueError("Command request_id must be a UUID") from exc

    def result(command: dict) -> dict:
        command["request_id"] = request_id
        return command

    action = payload.get("action")
    if action in SIMPLE_WEB_COMMANDS:
        return result({"action": action})
    if action == "volume":
        value = payload.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 200:
            raise ValueError("Volume must be between 0 and 200")
        return result({"action": action, "value": float(value)})
    if action == "seek":
        value = payload.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
            raise ValueError("Seek position must be non-negative")
        return result({"action": action, "value": int(value)})
    if action == "loop":
        value = payload.get("value")
        if value not in {"off", "track", "queue"}:
            raise ValueError("Invalid loop mode")
        return result({"action": action, "value": value})
    if action in {"remove", "jump"}:
        index = payload.get("index")
        if isinstance(index, bool) or not isinstance(index, int) or index < 0:
            raise ValueError("Queue index must be a non-negative integer")
        return result({"action": action, "index": index})
    if action == "move":
        from_index = payload.get("from")
        to_index = payload.get("to")
        if any(
            isinstance(value, bool) or not isinstance(value, int) or value < 0
            for value in (from_index, to_index)
        ):
            raise ValueError("Queue indexes must be non-negative integers")
        return result({"action": action, "from": from_index, "to": to_index})
    raise ValueError("Unsupported player command")


def _valid_request_id(payload: object) -> str | None:
    """Return a canonical request ID when an invalid command can be acknowledged."""
    if not isinstance(payload, dict) or not isinstance(payload.get("request_id"), str):
        return None
    try:
        return str(uuid.UUID(payload["request_id"]))
    except (ValueError, AttributeError):
        return None


# ── Endpoints ────────────────────────────────────────────

@router.get("/{guild_id}", response_model=PlayerStateResponse)
async def get_player_state(
    guild_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current player state for a guild from Redis."""
    await require_guild_access_by_discord_id(guild_id, current_user, db)
    state_raw = await redis_client.get(f"player_state:{guild_id}")
    if state_raw:
        raw = json.loads(state_raw)
        normalized = normalize_bot_state(raw)
        return PlayerStateResponse(**normalized)
    return PlayerStateResponse(guild_id=guild_id)


@router.post("/search")
async def search_tracks(
    data: SearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search for tracks via the bot's Lavalink connection."""
    await require_guild_access_by_discord_id(data.guild_id, current_user, db)
    request_id = str(uuid.uuid4())
    result_key = f"search_result:{request_id}"

    # Publish search request for the bot
    subscribers = await redis_client.publish("bot_search:request", json.dumps({
        "request_id": request_id,
        "query": data.query,
        "guild_id": data.guild_id,
    }))
    if subscribers < 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Music bot is unavailable.",
        )

    # Use BLPOP on a list key for efficient waiting instead of polling with sleep.
    # The bot writes results to a Redis key; we poll with a single BLPOP that
    # blocks server-side while Lavalink tries bounded local/fallback nodes,
    # avoiding repeated client/API polling round-trips.
    result = await redis_client.blpop(f"search_ready:{request_id}", timeout=40)
    if result:
        search_data = await redis_client.get(result_key)
        if search_data:
            await redis_client.delete(result_key)
            return json.loads(search_data)

    # Fallback: check if result was written without the signal (backward compat)
    fallback = await redis_client.get(result_key)
    if fallback:
        await redis_client.delete(result_key)
        return json.loads(fallback)

    logger.warning("Search timed out for query=%s request_id=%s", data.query, request_id)
    return {"tracks": []}


@router.post("/play")
async def play_track(
    data: PlayRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a play/queue request to the bot via Redis."""
    guild = await require_guild_access_by_discord_id(data.guild_id, current_user, db)
    if not current_user.discord_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A Discord account is required for playback.",
        )

    requested_tracks = [data.track] if data.track else list(data.tracks or [])
    settings_result = await db.execute(
        select(ServerSettings).where(ServerSettings.guild_id == guild.id)
    )
    server_settings = settings_result.scalar_one_or_none()
    max_queue_size = server_settings.max_queue_size if server_settings else None
    max_song_duration_ms = (
        server_settings.max_song_duration * 1000
        if server_settings and server_settings.max_song_duration
        else None
    )
    if server_settings:
        if server_settings.max_queue_size:
            state_raw = await redis_client.get(f"player_state:{data.guild_id}")
            existing_count = 0
            if state_raw:
                try:
                    existing_count = len(json.loads(state_raw).get("queue") or [])
                except (json.JSONDecodeError, TypeError):
                    existing_count = 0
            if existing_count + len(requested_tracks) > server_settings.max_queue_size:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Queue limit is {server_settings.max_queue_size} tracks.",
                )
        if server_settings.max_song_duration:
            if any(track.duration and track.duration > max_song_duration_ms for track in requested_tracks):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="One or more tracks exceed this server's duration limit.",
                )

    request_id = str(uuid.uuid4())
    result_key = f"play_result:{request_id}"
    ready_key = f"play_ready:{request_id}"
    subscribers = await redis_client.publish("web_play:request", json.dumps({
        "request_id": request_id,
        "guild_id": data.guild_id,
        "track": data.track.model_dump() if data.track else None,
        "tracks": [t.model_dump() for t in data.tracks] if data.tracks else None,
        "action": data.action.value,
        "user_discord_id": current_user.discord_id,
        "max_queue_size": max_queue_size,
        "max_song_duration_ms": max_song_duration_ms,
    }))
    if subscribers < 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Music bot is unavailable.",
        )

    ready = await redis_client.blpop(ready_key, timeout=60)
    result_raw = await redis_client.get(result_key) if ready else None
    await redis_client.delete(result_key, ready_key)
    if not result_raw:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Music bot did not acknowledge the playback request.",
        )
    try:
        result = json.loads(result_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Music bot returned an invalid acknowledgement.",
        ) from exc
    if not result.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("error") or "Playback request was rejected.",
        )
    return {"status": "ok", "action": data.action.value, "request_id": request_id}


# ── WebSocket (with JWT auth) ────────────────────────────

async def _authenticate_ws(token: str | None, guild_id: str) -> User | None:
    """Verify JWT token for WebSocket connections."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None

        async with async_session_factory() as db:
            user = await UserService(db).get_user(int(user_id))
            if not user.is_active or not user.discord_id:
                return None
            await require_guild_access_by_discord_id(guild_id, user, db)
        return user
    except Exception:
        return None


@router.websocket("/ws/{guild_id}")
async def player_websocket(
    websocket: WebSocket,
    guild_id: str,
    token: str | None = Query(default=None),
):
    """WebSocket endpoint for realtime player state updates.

    Requires JWT auth via query param: /player/ws/{guild_id}?token=<jwt>
    """
    # Authenticate before accepting the connection
    user = await _authenticate_ws(token, guild_id)
    if not user:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    await ws_manager.connect(websocket, guild_id)
    
    # Send current state immediately on connect
    state_raw = await redis_client.get(f"player_state:{guild_id}")
    if state_raw:
        try:
            raw = json.loads(state_raw)
            normalized = normalize_bot_state(raw)
            await websocket.send_text(json.dumps(normalized))
        except Exception:
            pass

    try:
        while True:
            raw_data = await websocket.receive_text()
            payload: object | None = None
            try:
                payload = json.loads(raw_data)
                command = _validated_web_command(payload)
                command["user_id"] = user.discord_id
                logger.info("Publishing web command action=%s guild=%s", command["action"], guild_id)
                subscribers = await redis_client.publish(
                    f"web_command:{guild_id}",
                    json.dumps(command),
                )
                if subscribers < 1:
                    logger.warning("Player command dropped because bot is unavailable guild=%s", guild_id)
                    await redis_client.publish(
                        f"player:{guild_id}",
                        json.dumps({
                            "type": "command_result",
                            "request_id": command["request_id"],
                            "ok": False,
                            "error": "Music bot is unavailable.",
                        }),
                    )
            except (json.JSONDecodeError, ValueError) as exc:
                logger.warning("Rejected invalid player command guild=%s: %s", guild_id, exc)
                request_id = _valid_request_id(payload)
                if request_id:
                    await websocket.send_text(json.dumps({
                        "type": "command_result",
                        "request_id": request_id,
                        "ok": False,
                        "error": str(exc),
                    }))
            except Exception as exc:
                logger.error("Error publishing player command guild=%s: %s", guild_id, exc)
                request_id = _valid_request_id(payload)
                if request_id:
                    await websocket.send_text(json.dumps({
                        "type": "command_result",
                        "request_id": request_id,
                        "ok": False,
                        "error": "Could not send the player command.",
                    }))
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(websocket, guild_id)
