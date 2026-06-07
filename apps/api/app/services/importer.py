import re
import os
import json
import asyncio
import httpx
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from ytmusicapi import YTMusic

class PlaylistImporter:
    def __init__(self):
        self.ytmusic = YTMusic()
        
        client_id = os.environ.get("SPOTIFY_CLIENT_ID")
        client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
        if client_id and client_secret:
            self.sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(client_id=client_id, client_secret=client_secret))
        else:
            self.sp = None

    def parse_url(self, url: str):
        if "spotify.com" in url and "playlist" in url:
            return "spotify", self._extract_spotify_id(url)
        elif "youtube.com" in url or "youtu.be" in url:
            if "list=" in url:
                return "youtube", self._extract_youtube_id(url)
        return None, None

    def _extract_spotify_id(self, url: str):
        match = re.search(r"playlist/([a-zA-Z0-9]+)", url)
        return match.group(1) if match else None

    def _extract_youtube_id(self, url: str):
        match = re.search(r"list=([a-zA-Z0-9_-]+)", url)
        return match.group(1) if match else None

    async def fetch_playlist(self, url: str):
        platform, pid = self.parse_url(url)
        if not platform or not pid:
            raise ValueError("Unsupported or invalid playlist URL")
            
        if platform == "spotify":
            return await self._fetch_spotify(pid)
        elif platform == "youtube":
            return await asyncio.to_thread(self._fetch_youtube, pid)

    async def _fetch_youtube_equivalent(self, title: str, author: str, fallback_cover: str, original_duration: int, spotify_id: str, position: int):
        if title:
            query = f"{title} {author}"
            try:
                results = await asyncio.to_thread(self.ytmusic.search, query, filter="songs", limit=1)
                if results and results[0].get('videoId'):
                    res = results[0]
                    artists = ", ".join([a['name'] for a in res.get('artists', []) if a.get('name')])
                    thumbnails = res.get('thumbnails', [])
                    artwork_url = thumbnails[-1]['url'] if thumbnails else fallback_cover
                    
                    return {
                        "track_title": res.get('title', title),
                        "track_author": artists or author,
                        "track_url": f"https://music.youtube.com/watch?v={res['videoId']}",
                        "track_identifier": res['videoId'],
                        "source": "youtube",
                        "duration_ms": res.get('duration_seconds', 0) * 1000 or original_duration,
                        "artwork_url": artwork_url,
                        "position": position
                    }
            except Exception:
                pass
                
        # Fallback to Spotify if no YT equivalent found
        return {
            "track_title": title or 'Unknown Track',
            "track_author": author,
            "track_url": f"https://open.spotify.com/track/{spotify_id}" if spotify_id else '',
            "track_identifier": spotify_id,
            "source": "spotify",
            "duration_ms": original_duration,
            "artwork_url": fallback_cover,
            "position": position
        }

    async def _fetch_spotify(self, pid: str):
        # We use the unauthenticated Spotify Embed player to bypass API restrictions
        embed_url = f"https://open.spotify.com/embed/playlist/{pid}"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(embed_url)
            if resp.status_code != 200:
                raise ValueError(f"Failed to fetch Spotify playlist: HTTP {resp.status_code}")
                
            # Extract JSON payload
            match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', resp.text)
            if not match:
                raise ValueError("Could not extract playlist data from Spotify embed.")
                
            data = json.loads(match.group(1))
            try:
                entity = data['props']['pageProps']['state']['data']['entity']
            except KeyError:
                raise ValueError("Unexpected Spotify data structure.")
                
            playlist_name = entity.get('name', 'Unknown Spotify Playlist')
            cover_art = None
            if entity.get('coverArt') and entity['coverArt'].get('sources'):
                cover_art = entity['coverArt']['sources'][0]['url']
                
            tracks_raw = entity.get('trackList', [])
            
            # Concurrently fetch full YT equivalents for each track
            tasks = []
            for i, track in enumerate(tracks_raw):
                title = track.get('title', '')
                if not title: continue
                author = track.get('subtitle', '')
                original_duration = track.get('duration', 0)
                spotify_id = track.get('uri', '').split(':')[-1] if track.get('uri') else ''
                tasks.append(self._fetch_youtube_equivalent(title, author, cover_art, original_duration, spotify_id, i))
                
            tracks = await asyncio.gather(*tasks)
                
            return {
                "name": playlist_name,
                "description": entity.get('description', ''),
                "tracks": tracks
            }

    def _fetch_youtube(self, pid: str):
        try:
            playlist = self.ytmusic.get_playlist(pid)
        except Exception as e:
            raise ValueError(f"Failed to fetch YouTube playlist: {str(e)}")
            
        tracks = []
        for i, track in enumerate(playlist.get('tracks', [])):
            artists = ", ".join([a['name'] for a in track.get('artists', [])])
            art_url = track['thumbnails'][-1]['url'] if track.get('thumbnails') else None
            video_id = track.get('videoId')
            
            if not video_id:
                continue
                
            tracks.append({
                "track_title": track.get('title', 'Unknown Track'),
                "track_author": artists,
                "track_url": f"https://music.youtube.com/watch?v={video_id}",
                "track_identifier": video_id,
                "source": "youtube",
                "duration_ms": track.get('duration_seconds', 0) * 1000 if track.get('duration_seconds') else 0,
                "artwork_url": art_url,
                "position": i
            })
            
        return {
            "name": playlist.get('title', 'Imported YouTube Playlist'),
            "description": playlist.get('description', ''),
            "tracks": tracks
        }

importer = PlaylistImporter()
