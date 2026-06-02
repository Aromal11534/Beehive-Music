import asyncio
import json
import uuid
import sys
from redis.asyncio import Redis

async def main():
    redis = Redis(host='redis', port=6379, decode_responses=True)
    request_id = str(uuid.uuid4())
    result_key = f"search_result:{request_id}"
    
    print(f"Publishing search request: {request_id}")
    await redis.publish("bot_search:request", json.dumps({
        "request_id": request_id,
        "query": "ytsearch:taylor swift",
        "guild_id": "681156128847036488"
    }))
    
    print("Waiting for response...")
    for i in range(16):
        await asyncio.sleep(0.5)
        result = await redis.get(result_key)
        if result:
            print("Received result!")
            print(result)
            await redis.delete(result_key)
            return
        sys.stdout.write(".")
        sys.stdout.flush()
    print("\nTimeout waiting for bot!")

asyncio.run(main())
