import asyncio
import time
from ytmusicapi import YTMusic

ytmusic = YTMusic()

async def search_track(title, artist):
    query = f"{title} {artist}"
    try:
        results = await asyncio.to_thread(ytmusic.search, query, filter="songs", limit=1)
        if results:
            thumbnails = results[0].get('thumbnails')
            if thumbnails:
                return thumbnails[-1]['url']
    except Exception as e:
        print(f"Error for {query}: {e}")
    return None

async def main():
    tracks = [
        ("hate that i made you love me", "Ariana Grande"),
        ("Snooze", "SZA"),
        ("Paint The Town Red", "Doja Cat"),
        ("Cruel Summer", "Taylor Swift"),
        ("vampire", "Olivia Rodrigo")
    ] * 10  # 50 tracks
    
    start = time.time()
    results = await asyncio.gather(*(search_track(t, a) for t, a in tracks))
    end = time.time()
    
    print(f"Fetched {len([r for r in results if r])} artworks in {end - start:.2f} seconds")

if __name__ == "__main__":
    asyncio.run(main())
