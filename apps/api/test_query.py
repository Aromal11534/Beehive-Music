import asyncio
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.guild import DiscordGuild, UserGuildAccess
from app.models.user import User

async def main():
    async with async_session_factory() as db:
        # Get users
        users = await db.execute(select(User))
        for u in users.scalars().all():
            print(f"User: {u.id} - {u.username}")

        # Get Discord guilds
        guilds = await db.execute(select(DiscordGuild))
        for g in guilds.scalars().all():
            print(f"Guild: {g.id} - {g.discord_guild_id} - {g.name}")

        # Get access
        accesses = await db.execute(select(UserGuildAccess))
        for a in accesses.scalars().all():
            print(f"Access: User {a.user_id} -> Guild {a.guild_id}")

if __name__ == "__main__":
    asyncio.run(main())
