import httpx
import re
import json

async def scrape_embed(url: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    embed_url = url.replace("open.spotify.com/playlist/", "open.spotify.com/embed/playlist/")
    
    async with httpx.AsyncClient(headers=headers) as client:
        resp = await client.get(embed_url)
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', resp.text)
        if match:
            data = json.loads(match.group(1))
            entity = data['props']['pageProps']['state']['data']['entity']
            tracks = entity.get('trackList', [])
            print(json.dumps(tracks[0], indent=2))
        else:
            print("No __NEXT_DATA__ found.")

if __name__ == "__main__":
    import asyncio
    asyncio.run(scrape_embed("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"))
