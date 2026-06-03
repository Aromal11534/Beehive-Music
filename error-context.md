# Beehive Music Error Context

## Problem

After deploying Beehive Music to the production server, music search and playback behaved worse than the local desktop setup:

- Web search returned low-quality SoundCloud covers/remixes instead of original songs.
- YouTube and YouTube Music tracks appeared in search tests but failed during playback.
- Lavalink logged YouTube anti-bot and stream extraction failures.

## Symptoms

The main Lavalink playback errors were:

```text
Sign in to confirm you're not a bot
This video requires login
All clients failed to load the item
```

After enabling YouTube OAuth, playback hit a second YouTube cipher error:

```text
Must find sig function from script
```

## Root Cause

The desktop localhost setup worked because it used a normal residential/client network path. The production server runs from a datacenter/VPS IP, which YouTube treats more aggressively as automated traffic.

There were two separate issues:

1. YouTube anti-bot checks blocked unauthenticated Lavalink stream requests from the server.
2. YouTube changed player signature/cipher logic, and the local cipher extractor in the Lavalink YouTube plugin could not parse the current player script.

During debugging, search had been temporarily switched to SoundCloud as a workaround. That made playback more reliable but caused poor catalog quality and non-original tracks.

## Fix

The production fix restored YouTube as the primary source and added the supported YouTube workarounds:

- Restored bot search default from `scsearch` to `ytmsearch`.
- Removed the SoundCloud fallback that replaced YouTube tracks before playback.
- Increased returned search results from 10 to 25.
- Enabled YouTube OAuth in Lavalink and persisted the OAuth refresh token via environment config.
- Added a self-hosted `yt-cipher` service for YouTube remote cipher/signature deciphering.
- Configured Lavalink to use the internal `yt-cipher` service.

## Verification

Verification after the fix:

- YouTube Music search returned official YouTube results.
- Lavalink startup logged successful YouTube OAuth token refresh.
- Lavalink startup logged usage of the remote cipher server.
- A real YouTube Music track was sent through the bot playback path.
- Lavalink player state reported:

```text
source=youtube
paused=false
connected=true
position advancing
```

## Operational Notes

- The OAuth refresh token is stored in `.env.server` and should not be committed.
- The internal cipher API token is stored in `.env.server` and should not be committed.
- `beehive-yt-cipher` is an internal helper container and does not need a public port.
- If YouTube changes cipher behavior again, update or restart the `yt-cipher` image/service.
