import httpx
import json

response = httpx.post("http://localhost:8001/api/v1/player/search", json={
    "query": "hello",
    "guild_id": "681156128847036488"
})
print("Status:", response.status_code)
print("Response:", json.dumps(response.json(), indent=2))
