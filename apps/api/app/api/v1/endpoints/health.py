"""Health check endpoint."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.database import async_session_factory
from app.core.redis import redis_client

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
async def health_check():
    """Readiness check for both required API data stores."""
    redis_ok = False
    database_ok = False
    try:
        await redis_client.ping()
        redis_ok = True
    except Exception:
        pass

    try:
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
        database_ok = True
    except Exception:
        pass

    healthy = redis_ok and database_ok
    payload = {
        "status": "healthy" if healthy else "degraded",
        "service": "beehive-api",
        "redis": "connected" if redis_ok else "disconnected",
        "database": "connected" if database_ok else "disconnected",
    }
    return JSONResponse(payload, status_code=200 if healthy else 503)
