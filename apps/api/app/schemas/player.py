"""Player state and queue schemas for realtime data."""

from pydantic import BaseModel, Field


class QueueTrackResponse(BaseModel):
    position: int = 0
    track_title: str = ""
    track_author: str | None = None
    track_url: str = ""
    duration_ms: int | None = None
    artwork_url: str | None = None
    requested_by: str | None = None


class PlayerStateResponse(BaseModel):
    guild_id: str
    is_playing: bool = False
    is_paused: bool = False
    current_track: QueueTrackResponse | None = None
    position_ms: int = 0
    volume: int = 80
    loop_mode: str = "off"
    queue: list[QueueTrackResponse] = []
    queue_length: int = 0


def normalize_bot_state(raw: dict) -> dict:
    """Convert bot's camelCase state to API snake_case format."""

    def normalize_track(t: dict, idx: int = 0) -> dict:
        return {
            "position": t.get("position", idx),
            "track_title": t.get("title", t.get("track_title", "")),
            "track_author": t.get("author", t.get("track_author")),
            "track_url": t.get("url", t.get("track_url", "")),
            "duration_ms": t.get("duration", t.get("duration_ms")),
            "artwork_url": t.get("artworkUrl", t.get("artwork_url")),
            "requested_by": t.get("requestedBy", t.get("requested_by")),
        }

    current = raw.get("currentTrack") or raw.get("current_track")
    queue_raw = raw.get("queue", [])

    return {
        "guild_id": raw.get("guildId", raw.get("guild_id", "")),
        "is_playing": raw.get("isPlaying", raw.get("is_playing", False)),
        "is_paused": raw.get("isPaused", raw.get("is_paused", False)),
        "current_track": normalize_track(current) if current else None,
        "position_ms": raw.get("positionMs", raw.get("position_ms", 0)),
        "volume": raw.get("volume", 80),
        "loop_mode": raw.get("loopMode", raw.get("loop_mode", "off")),
        "queue": [normalize_track(t, i) for i, t in enumerate(queue_raw)],
        "queue_length": len(queue_raw),
    }
