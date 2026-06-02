import asyncio
import httpx
from app.core.database import async_session_factory
from sqlalchemy import select
from app.models.user import User
from app.core.security import create_access_token

async def main():
    async with async_session_factory() as db:
        users = await db.execute(select(User))
        for u in users.scalars().all():
            print(f"Testing user {u.username} (ID {u.id})")
            token = create_access_token({"sub": str(u.id)})
            async with httpx.AsyncClient() as client:
                res = await client.get(
                    "http://localhost:8001/api/v1/guilds/my",
                    headers={"Authorization": f"Bearer {token}"}
                )
                print(f"Status: {res.status_code}")
                print(f"Response: {res.json()}")
                print("-------------------")

asyncio.run(main())
