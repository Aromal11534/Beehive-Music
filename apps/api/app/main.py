"""Beehive API — FastAPI application factory."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import get_settings
from app.core.logging_filters import SensitiveQueryFilter
from app.core.redis import close_redis
from app.core.rate_limit import limiter
from app.api.v1.router import api_router
from app.websocket.manager import ws_manager


# ── Structured Logging ──────────────────────────────────
def _configure_logging():
    settings = get_settings()
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # Suppress noisy third-party loggers
    credential_filter = SensitiveQueryFilter()
    uvicorn_access_logger = logging.getLogger("uvicorn.access")
    uvicorn_access_logger.setLevel(logging.WARNING)
    uvicorn_access_logger.addFilter(credential_filter)
    logging.getLogger("uvicorn.error").addFilter(credential_filter)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.debug else logging.WARNING
    )

_configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle — startup and shutdown."""
    settings = get_settings()
    logger.info("Starting Beehive API (env=%s)", settings.app_env)

    # Start WebSocket Redis subscriber
    ws_manager.start_background_subscriber()

    yield

    # Cleanup
    logger.info("Shutting down Beehive API")
    await ws_manager.stop()
    await close_redis()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Beehive API",
        description="Discord Music Bot Control Panel API",
        version="1.0.0",
        docs_url="/api/docs" if settings.app_env != "production" else None,
        redoc_url="/api/redoc" if settings.app_env != "production" else None,
        lifespan=lifespan,
    )

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routes
    app.include_router(api_router)

    return app


app = create_app()
