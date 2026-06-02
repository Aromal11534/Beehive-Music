"""Redis client for caching, sessions, and pub/sub."""

import redis.asyncio as redis

from app.core.config import get_settings

settings = get_settings()

redis_client = redis.from_url(
    settings.redis_url,
    decode_responses=True,
)


async def get_redis() -> redis.Redis:
    return redis_client


async def publish_event(channel: str, message: str):
    """Publish an event to a Redis pub/sub channel."""
    await redis_client.publish(channel, message)


async def close_redis():
    await redis_client.aclose()
