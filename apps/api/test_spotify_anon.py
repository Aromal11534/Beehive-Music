import httpx
import json

async def test_anon_spotify():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    async with httpx.AsyncClient(headers=headers) as client:
        # Step 1: Get anonymous token
        print("Fetching anonymous token...")
        try:
            resp = await client.get("https://open.spotify.com/get_access_token?reason=transport&productType=web_player")
            resp.raise_for_status()
            token_data = resp.json()
            access_token = token_data.get('clientId') # Wait, usually it returns clientId, accessToken, accessTokenExpirationTimestampMs
            access_token = token_data.get('accessToken')
            print(f"Token acquired: {access_token[:20]}...")
        except Exception as e:
            print(f"Failed to get token: {e}")
            return
            
        # Step 2: Use token to fetch playlist
        print("Fetching playlist...")
        api_headers = {
            "Authorization": f"Bearer {access_token}",
            "User-Agent": headers["User-Agent"]
        }
        try:
            # 37i9dQZF1DXcBWIGoYBM5M
            api_resp = await client.get("https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M", headers=api_headers)
            print("Status:", api_resp.status_code)
            if api_resp.status_code == 200:
                data = api_resp.json()
                print("Success! Playlist Name:", data.get('name'))
                print("Track count:", len(data.get('tracks', {}).get('items', [])))
            else:
                print("Error payload:", api_resp.text)
        except Exception as e:
            print(f"Failed to fetch playlist: {e}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_anon_spotify())
