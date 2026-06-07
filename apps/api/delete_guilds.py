import asyncio
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.guild import DiscordGuild

async def main():
    async with async_session_factory() as db:
        result = await db.execute(select(DiscordGuild).filter(DiscordGuild.name.in_(['Only Keli', 'Syncify'])))
        guilds = result.scalars().all()
        print('Deleting guilds:', [g.name for g in guilds])
        for g in guilds:
            await db.delete(g)
        await db.commit()
        print('Deleted successfully.')

if __name__ == '__main__':
    asyncio.run(main())
