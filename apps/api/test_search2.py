import asyncio
import json
import uuid
import sys
from app.core.redis import redis_client

async def main():
    request_id = str(uuid.uuid4())
    result_key = f"search_result:{request_id}"
    ready_key = f"search_ready:{request_id}"
    
    print(f"Publishing search request: {request_id}")
    await redis_client.publish("bot_search:request", json.dumps({
        "request_id": request_id,
        "query": "ytsearch:taylor swift",
        "guild_id": "681156128847036488"
    }))
    
    print("Waiting for response...")
    result = await redis_client.blpop(ready_key, timeout=8)
    if result:
        print("Got ready signal!")
        search_data = await redis_client.get(result_key)
        if search_data:
            print("Received result!")
            print(search_data)
            await redis_client.delete(result_key)
            return
    print("\nTimeout waiting for bot!")

asyncio.run(main())
