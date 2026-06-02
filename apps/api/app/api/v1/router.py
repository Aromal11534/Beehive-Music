"""API v1 router — aggregates all endpoint routers."""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, auth_discord, users, mfa, sessions, guilds, playlists, favorites, history, avatars, player, health, stats

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(auth_discord.router)
api_router.include_router(users.router)
api_router.include_router(mfa.router)
api_router.include_router(sessions.router)
api_router.include_router(guilds.router)
api_router.include_router(playlists.router)
api_router.include_router(favorites.router)
api_router.include_router(history.router)
api_router.include_router(avatars.router)
api_router.include_router(player.router)
api_router.include_router(stats.router)
