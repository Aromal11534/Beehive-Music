import httpx
import re
import json

async def scrape_spotify(url: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    async with httpx.AsyncClient(headers=headers) as client:
        resp = await client.get(url)
        html = resp.text
        
        # Spotify injects data in a script tag like:
        # <script id="initial-state" type="text/plain">{"data":...}</script>
        # or <script id="__NEXT_DATA__" type="application/json">...</script>
        
        # Let's search for typical JSON injection patterns
        print("HTML length:", len(html))
        
        # Try to find __NEXT_DATA__
        next_data_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', html)
        if next_data_match:
            print("Found __NEXT_DATA__!")
            data = json.loads(next_data_match.group(1))
            print("Data keys:", data.keys())
            return
            
        # Try to find initial-state
        initial_state_match = re.search(r'<script id="initial-state" type="text/plain">(.+?)</script>', html)
        if initial_state_match:
            import base64
            print("Found initial-state!")
            # initial-state is usually base64 encoded JSON
            try:
                decoded = base64.b64decode(initial_state_match.group(1)).decode('utf-8')
                data = json.loads(decoded)
                print("Decoded JSON keys:", data.keys())
            except Exception as e:
                print("Failed to decode initial-state:", e)
            return
            
        print("Could not find JSON payload in HTML.")

if __name__ == "__main__":
    import asyncio
    asyncio.run(scrape_spotify("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"))
