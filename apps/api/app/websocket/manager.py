"""WebSocket connection manager for realtime player state updates."""

import json
import asyncio
import logging
from typing import Dict, Set
from fastapi import WebSocket

from app.core.redis import redis_client
from app.schemas.player import normalize_bot_state

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections per guild for realtime updates."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self._subscriber_task: asyncio.Task | None = None

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

    async def start_redis_subscriber(self):
        """Subscribe to Redis pub/sub for player state events."""
        pubsub = redis_client.pubsub()
        await pubsub.psubscribe("player:*")
        logger.info("Redis subscriber started for player:* channels")

        async for message in pubsub.listen():
            if message["type"] == "pmessage":
                channel = message["channel"]
                # channel format: player:<guild_id>
                guild_id = channel.split(":", 1)[1] if ":" in channel else None
                if guild_id:
                    try:
                        raw = json.loads(message["data"])
                        # Normalize bot's camelCase to snake_case for the web client
                        normalized = normalize_bot_state(raw)
                        await self.broadcast_to_guild(guild_id, normalized)
                    except json.JSONDecodeError:
                        logger.warning("Failed to decode player state for guild %s", guild_id)
                    except Exception as e:
                        logger.error("Error broadcasting to guild %s: %s", guild_id, e)

    def start_background_subscriber(self):
        self._subscriber_task = asyncio.create_task(self.start_redis_subscriber())

    async def stop(self):
        if self._subscriber_task:
            self._subscriber_task.cancel()
            try:
                await self._subscriber_task
            except asyncio.CancelledError:
                pass
        logger.info("WebSocket manager stopped")


ws_manager = ConnectionManager()
