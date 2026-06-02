"""Health check endpoint."""

from fastapi import APIRouter

from app.core.redis import redis_client

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
async def health_check():
    """Basic health check."""
    redis_ok = False
    try:
        await redis_client.ping()
        redis_ok = True
    except Exception:
        pass

    return {
        "status": "healthy" if redis_ok else "degraded",
        "service": "beehive-api",
        "redis": "connected" if redis_ok else "disconnected",
    }
