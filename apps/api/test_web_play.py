import asyncio
import json
import redis.asyncio as redis

async def main():
    client = redis.Redis.from_url("redis://beehive-redis:6379/0")
    
    # 681156128847036488 is the Only Keli server
    track_data = {
        "guild_id": "681156128847036488",
        "action": "play",
        "track": {
            "encoded": "QAAAjAIAK0FyaXlhdGhlIEFyaXlhdGhlIFtGcm9tICJSYXZhbmFwcmFiaHUiXQAAFVB1dGhlbmNoZXJ5IFN1cmVzaCAAAALk3nAAAAAAC2rB8zEAABkxaHR0cHM6Ly95b3V0dS5iZS9zV2YtWmxxUWQzTQAAEHNXZi1abHFRZDNNfHl0c2VhcmNoAAAKeW91dHViZQAAAAAA",
            "title": "Ariyathe Ariyathe [From \"Ravanaprabhu\"]",
            "author": "Puthenchery Suresh",
            "url": "https://youtu.be/sWf-ZlqQd3M",
            "identifier": "sWf-ZlqQd3M",
            "duration": 332000,
            "source": "youtube"
        }
    }
    
    print("Publishing web_play:request...")
    await client.publish("web_play:request", json.dumps(track_data))
    print("Done")

if __name__ == "__main__":
    asyncio.run(main())
