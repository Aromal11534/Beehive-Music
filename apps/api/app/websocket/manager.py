"""WebSocket connection manager for realtime player state updates."""

import json
import asyncio
import logging
from typing import Dict, Set
from fastapi import WebSocket

from app.core.redis import redis_client
from app.schemas.player import normalize_bot_message

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections per guild for realtime updates."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self._subscriber_task: asyncio.Task | None = None
        self._stopping = False

    async def connect(self, websocket: WebSocket, guild_id: str):
        await websocket.accept()
        if guild_id not in self.active_connections:
            self.active_connections[guild_id] = set()
        self.active_connections[guild_id].add(websocket)
        logger.info("WebSocket connected for guild %s (total: %d)", guild_id, len(self.active_connections[guild_id]))

    def disconnect(self, websocket: WebSocket, guild_id: str):
        if guild_id in self.active_connections:
            self.active_connections[guild_id].discard(websocket)
            if not self.active_connections[guild_id]:
                del self.active_connections[guild_id]
        logger.info("WebSocket disconnected for guild %s", guild_id)

    async def broadcast_to_guild(self, guild_id: str, message: dict):
        if guild_id in self.active_connections:
            data = json.dumps(message)
            dead = set()
            for ws in self.active_connections[guild_id]:
                try:
                    await ws.send_text(data)
                except Exception:
                    dead.add(ws)
            for ws in dead:
                self.active_connections[guild_id].discard(ws)

    async def handle_track_start(self, payload: dict):
        from app.core.database import async_session_factory
        from sqlalchemy import select
        from app.models.guild import DiscordGuild
        from app.models.user import User
        from app.services.history_service import HistoryService
        from app.schemas.history import PlayHistoryCreate
        
        guild_discord_id = payload.get("guild_discord_id")
        user_discord_id = payload.get("requested_by_discord_id")
        
        async with async_session_factory() as db:
            guild_result = await db.execute(select(DiscordGuild).filter(DiscordGuild.discord_guild_id == guild_discord_id))
            guild = guild_result.scalar_one_or_none()
            if not guild:
                return
            
            user_id = None
            if user_discord_id:
                user_result = await db.execute(select(User).filter(User.discord_id == user_discord_id))
                user = user_result.scalar_one_or_none()
                if user:
                    user_id = user.id
            
            history_data = PlayHistoryCreate(
                guild_id=guild.id,
                track_title=payload.get("track_title") or "Unknown",
                track_author=payload.get("track_author") or "Unknown",
                track_url=payload.get("track_url") or "",
                track_identifier=payload.get("track_identifier") or "",
                source=payload.get("source") or "unknown",
                duration_ms=payload.get("duration_ms") or 0,
                requested_by_user_id=user_id,
            )
            
            await HistoryService(db).record(user_id=user_id, data=history_data)
            await db.commit()

    async def start_redis_subscriber(self):
        """Subscribe to Redis and reconnect with backoff after transient failure."""
        retry_delay = 1.0
        while not self._stopping:
            pubsub = redis_client.pubsub()
            try:
                await pubsub.psubscribe("player:*", "bot_event:*")
                logger.info("Redis subscriber started for player:* and bot_event:* channels")
                retry_delay = 1.0

                async for message in pubsub.listen():
                    if message["type"] != "pmessage":
                        continue
                    channel = message["channel"]
                    if channel.startswith("player:"):
                        guild_id = channel.split(":", 1)[1] if ":" in channel else None
                        if not guild_id:
                            continue
                        try:
                            raw = json.loads(message["data"])
                            # Player state needs case normalization; command ACKs must
                            # retain their request ID so the web Promise can settle.
                            normalized = normalize_bot_message(raw)
                            await self.broadcast_to_guild(guild_id, normalized)
                        except json.JSONDecodeError:
                            logger.warning("Failed to decode player state for guild %s", guild_id)
                        except Exception as e:
                            logger.error("Error broadcasting to guild %s: %s", guild_id, e)
                    elif channel == "bot_event:track_start":
                        try:
                            payload = json.loads(message["data"])
                            await self.handle_track_start(payload)
                        except Exception as e:
                            logger.error("Failed to handle track start event: %s", e)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if not self._stopping:
                    logger.warning(
                        "Redis subscriber stopped (%s); retrying in %.1fs",
                        type(exc).__name__,
                        retry_delay,
                    )
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 30.0)
            finally:
                try:
                    await pubsub.aclose()
                except Exception:
                    pass

    def start_background_subscriber(self):
        if self._subscriber_task and not self._subscriber_task.done():
            return
        self._stopping = False
        self._subscriber_task = asyncio.create_task(self.start_redis_subscriber())

    async def stop(self):
        self._stopping = True
        if self._subscriber_task:
            self._subscriber_task.cancel()
            try:
                await self._subscriber_task
            except asyncio.CancelledError:
                pass
        logger.info("WebSocket manager stopped")


ws_manager = ConnectionManager()
