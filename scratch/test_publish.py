import json
import asyncio
import redis.asyncio as redis

async def main():
    r = redis.from_url('redis://localhost:6379/0', decode_responses=True)
    payload = {
        "guild_discord_id": "681156128847036488",
        "track_title": "Test Track",
        "track_author": "Test Author",
        "track_url": "http://example.com",
        "track_identifier": "test",
        "source": "youtube",
        "duration_ms": 12345,
        "requested_by_discord_id": None
    }
    await r.publish("bot_event:track_start", json.dumps(payload))
    print("Published successfully")
    await r.aclose()

asyncio.run(main())
