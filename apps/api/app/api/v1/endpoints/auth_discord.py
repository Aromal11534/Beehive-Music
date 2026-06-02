from typing import Any
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import os

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.guild import DiscordGuild, UserGuildAccess

router = APIRouter(prefix="/auth/discord", tags=["auth-discord"])

class DiscordSyncRequest(BaseModel):
    code: str
    redirect_uri: str

@router.post("/sync")
async def sync_discord_account(
    request: DiscordSyncRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Exchange Discord OAuth code, link account, and sync guilds."""
    client_id = os.environ.get("DISCORD_CLIENT_ID")
    client_secret = os.environ.get("DISCORD_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="Discord OAuth is not configured on the server.")
        
    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://discord.com/api/oauth2/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "authorization_code",
                "code": request.code,
                "redirect_uri": request.redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        if token_response.status_code != 200:
            print("Token error:", token_response.text)
            raise HTTPException(status_code=400, detail="Failed to exchange authorization code.")
            
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token returned from Discord.")
            
        # Fetch user info
        user_response = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if user_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch Discord user.")
            
        discord_user = user_response.json()
        discord_id = discord_user.get("id")
        
        # Link to current user
        current_user.discord_id = discord_id
        db.add(current_user)
        
        # Fetch user guilds
        guilds_response = await client.get(
            "https://discord.com/api/users/@me/guilds",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if guilds_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch Discord guilds.")
            
        discord_guilds = guilds_response.json()
        user_guild_ids = [g["id"] for g in discord_guilds]
        print(f"DISCORD GUILDS FETCHED: {len(user_guild_ids)}", flush=True)
        print(f"FIRST 5 GUILDS: {user_guild_ids[:5]}", flush=True)
        
        # Find which of these guilds the bot is actually in
        bot_guilds_result = await db.execute(
            select(DiscordGuild).where(DiscordGuild.discord_guild_id.in_(user_guild_ids))
        )
        bot_guilds = bot_guilds_result.scalars().all()
        print(f"BOT GUILDS MATCHED: {len(bot_guilds)}", flush=True)
        
        synced_count = 0
        for bot_guild in bot_guilds:
            # Check if user already has access
            existing = await db.execute(
                select(UserGuildAccess).where(
                    UserGuildAccess.user_id == current_user.id,
                    UserGuildAccess.guild_id == bot_guild.id
                )
            )
            if not existing.scalar_one_or_none():
                access = UserGuildAccess(
                    user_id=current_user.id,
                    guild_id=bot_guild.id,
                    role="viewer"
                )
                db.add(access)
                synced_count += 1
            else:
                print(f"User already has access to {bot_guild.name}", flush=True)
                
        await db.commit()
        
        return {
            "message": f"Successfully linked Discord account and synced {synced_count} server(s).",
            "discord_username": discord_user.get("username"),
            "synced_guilds": synced_count
        }
