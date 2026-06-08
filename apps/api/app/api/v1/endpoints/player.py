"""Player state endpoints — read player state from Redis."""

import json
import logging
import uuid
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, get_db
from app.core.redis import redis_client
from app.core.security import decode_access_token
from app.api.v1.deps import get_current_user, require_guild_access_by_discord_id
from app.schemas.player import PlayerStateResponse, normalize_bot_state
from app.websocket.manager import ws_manager
from app.models.user import User
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


class PlayAction(str, Enum):
    play = "play"
    queue = "queue"


class PlayRequest(BaseModel):
    guild_id: str = Field(..., min_length=1, max_length=20)
    track: Optional[TrackData] = None
    tracks: Optional[list[TrackData]] = Field(None, max_length=1000)
    action: PlayAction = PlayAction.play


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
    await redis_client.publish("bot_search:request", json.dumps({
        "request_id": request_id,
        "query": data.query,
        "guild_id": data.guild_id,
    }))

    # Use BLPOP on a list key for efficient waiting instead of polling with sleep.
    # The bot writes results to a Redis key; we poll with a single BLPOP that
    # blocks server-side for up to 8 seconds, avoiding repeated round-trips.
    result = await redis_client.blpop(f"search_ready:{request_id}", timeout=8)
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
    await require_guild_access_by_discord_id(data.guild_id, current_user, db)
    await redis_client.publish("web_play:request", json.dumps({
        "guild_id": data.guild_id,
        "track": data.track.model_dump() if data.track else None,
        "tracks": [t.model_dump() for t in data.tracks] if data.tracks else None,
        "action": data.action.value,
        "user_discord_id": current_user.discord_id,
    }))
    return {"status": "ok", "action": data.action.value}


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
            if not user.is_active:
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
            data = await websocket.receive_text()
            logger.info(f"WS received data from {guild_id}: {data}")
            if data:
                try:
                    command = json.loads(data)
                    command["user_id"] = user.discord_id
                    logger.info(f"Publishing command: {command}")
                    await redis_client.publish(f"web_command:{guild_id}", json.dumps(command))
                except json.JSONDecodeError as e:
                    logger.error(f"JSON error: {e}")
                    pass
                except Exception as e:
                    logger.error(f"Error publishing: {e}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, guild_id)
