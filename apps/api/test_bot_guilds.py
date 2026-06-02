import asyncio
import httpx
import os

async def main():
    token = os.environ.get("DISCORD_BOT_TOKEN")
    if not token:
        print("No DISCORD_BOT_TOKEN found in env.")
        return
        
    print("Testing token...")
    async with httpx.AsyncClient() as client:
        res = await client.get(
            "https://discord.com/api/v10/users/@me/guilds",
            headers={"Authorization": f"Bot {token}"}
        )
        if res.status_code != 200:
            print(f"Error: {res.status_code} {res.text}")
            return
            
        guilds = res.json()
        print(f"Bot is in {len(guilds)} guilds:")
        for g in guilds:
            print(f" - {g['name']} ({g['id']})")

asyncio.run(main())
