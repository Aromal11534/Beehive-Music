import asyncio
import json
import os
from redis.asyncio import Redis

async def main():
    redis_url = os.environ.get("REDIS_URL", "redis://beehive-redis:6379/0")
    client = Redis.from_url(redis_url)
    print("Publishing leave command to bot...")
    await client.publish("web_command:1458839958864531489", json.dumps({"action": "leave"}))
    await client.publish("web_command:1207653969267261440", json.dumps({"action": "leave_test"}))
    print("Done")

asyncio.run(main())
