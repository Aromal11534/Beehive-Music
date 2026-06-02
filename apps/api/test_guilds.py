import asyncio
from app.services.guild_service import GuildService
from app.core.database import async_session_factory

async def main():
    async with async_session_factory() as db:
        service = GuildService(db)
        # 4 is aromal
        guilds = await service.get_user_guilds(4)
        for g in guilds:
            print(f"User 4 has access to: {g.guild.name} ({g.guild.discord_guild_id})")

if __name__ == "__main__":
    asyncio.run(main())
