import asyncio
from spotdl import Spotdl

async def main():
    spotdl = Spotdl()
    songs = spotdl.get_playlist_tracks("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
    print(f"Found {len(songs)} songs!")
    if songs:
        song = songs[0]
        print("First song:", song.name, song.artists, song.url)

if __name__ == "__main__":
    asyncio.run(main())
