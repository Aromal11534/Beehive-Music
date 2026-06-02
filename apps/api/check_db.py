import asyncio
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.user import User
from app.models.guild import UserGuildAccess, DiscordGuild

async def main():
    async with async_session_factory() as db:
        users = await db.execute(select(User))
        for u in users.scalars().all():
            print(f"User: {u.username}, Admin: {u.is_admin}")
        
        access = await db.execute(select(UserGuildAccess))
        for a in access.scalars().all():
            print(f"Access: User {a.user_id} -> Guild {a.guild_id} (Role: {a.role})")
            
        guilds = await db.execute(select(DiscordGuild))
        for g in guilds.scalars().all():
            print(f"Guild: {g.name} ({g.discord_guild_id})")

asyncio.run(main())
