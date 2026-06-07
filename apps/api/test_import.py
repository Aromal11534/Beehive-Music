import os
import sys

sys.path.append('apps/api')

from app.services.importer import PlaylistImporter

async def main():
    importer = PlaylistImporter()
    
    print("Testing Spotify...")
    try:
        data = await importer.fetch_playlist("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
        print(f"Spotify name: {data['name']}")
        print(f"Spotify track count: {len(data['tracks'])}")
    except Exception as e:
        print(f"Spotify error: {repr(e)}")
        
if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
