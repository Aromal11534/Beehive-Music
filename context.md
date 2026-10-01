# Beehive Music System Context

## Overview
Beehive Music is a full-stack Discord music bot with a real-time web dashboard. The project allows users to play music in Discord voice channels, control the queue from a web interface, manage playlists, import Spotify playlists, and save favorite tracks.

## Architecture & Tech Stack

### 1. Web Application (`/apps/web`)
- **Framework:** Next.js (React)
- **Styling:** Tailwind CSS (Premium glass-morphism aesthetic)
- **Features:** 
  - Real-time player state visualization (Now Playing, Queue).
  - Dashboard with dynamic playlists (Daily Mix, Quick Picks, Listen Again).
  - Playlist and Favorites management with Spotify import capabilities.
  - Discord OAuth2 for authentication.
  - Interactive UI with drag-and-drop queue reordering (via `dnd-kit`).
  - Seamless user feedback using custom `sonner` toasts.

### 2. Discord Bot (`/apps/bot`)
- **Framework:** Node.js with `discord.js`.
- **Music Engine:** Lavalink (via `shoukaku` or similar wrappers).
- **Features:**
  - Connects to Discord voice channels.
  - Handles song requests and queue management natively via commands.
  - Publishes its state to Redis for the API to consume.
  - Subscribes to Redis channels to listen for remote control commands from the web UI.

### 3. API Service (`/apps/api`)
- **Framework:** Python (FastAPI).
- **Database:** PostgreSQL (for user profiles, playlists, favorites, history).
- **Cache / PubSub:** Redis.
- **Features:**
  - Exposes RESTful endpoints for the web UI (Playlists, Favorites, History, Stats).
  - Handles robust error checking (e.g. 409 Conflicts for duplicate playlist/favorite items).
  - Processes Spotify URL imports, translating them into track metadata via scraping, and mapping them to `ytmsearch` equivalents for playback.
  - Manages Discord OAuth token exchange and session validation.
  - Provides WebSocket connections to stream real-time player state from the Bot to the Web UI.

### 4. Infrastructure & Production Notes
- **Docker Compose:** The entire stack is containerized using `docker-compose.yml`.
  - `web` (Next.js)
  - `api` (FastAPI)
  - `bot` (Discord.js)
  - `postgres` (Database)
  - `redis` (PubSub & Cache)
  - `lavalink` (Audio streaming node)
  - `nginx` & `certbot` (Reverse proxy and SSL)
  - `yt-cipher` (Helper service for YouTube anti-bot workarounds)

## Core Data Flow (Real-Time Control)

A critical aspect of this system is how the Web UI controls the Discord Bot without a direct API route between them. This is achieved via **Redis Pub/Sub**.

1. **State Streaming (Bot -> Web):**
   - The Bot maintains the source of truth for the music player state.
   - Every time the state changes, the Bot publishes a JSON payload to the Redis channel `player:{guild_id}` and stores the latest snapshot under `player_state:{guild_id}`.
   - The FastAPI backend subscribes to `player:*`, normalizes the bot payload, and streams the state over an open WebSocket connection to the Next.js web client.

2. **Remote Control (Web -> Bot):**
   - When a user clicks a button on the Web UI, the web client sends a bounded JSON action with a UUID request ID through the WebSocket to the FastAPI backend.
   - FastAPI publishes it to a Redis channel named `web_command:{guild_id}`.
   - The Node.js Discord Bot subscribes to `web_command:*`, executes the command, and publishes a `command_result` acknowledgement. The web client updates only after that acknowledgement succeeds.

## Recent Development History (Compacted)

- **Premium UI Overhaul:** Upgraded the visual aesthetics of the Dashboard, Playlists, Favorites, and Queue pages to use a glass-morphism design with Tailwind. Implemented `sonner` for elegant UI toast notifications. Updated the core branding with a new logo and favicon.
- **Queue Manipulation:** 
   - Implemented `dnd-kit` in the web application to allow drag-and-drop reordering.
   - Backend bot supports `move`, `remove`, and `jump` actions over Redis Pub/Sub.
- **Spotify Imports & Dynamic Playlists:** 
   - Created Python logic to scrape Spotify metadata and translate it to generic searchable tracks format.
   - Users can now append tracks from external playlists (Spotify/YouTube Music) directly to existing Beehive playlists.
   - Implemented dynamic dashboard playlists (Daily Mix, Quick Picks) generated on the fly.
- **Favorites & Playlist Robustness:** 
   - Proper backend checks for duplicate tracks (409 Conflict) handled elegantly. Deduplication is natively handled when appending to existing playlists.
   - Implemented a resilient `FallbackImage` React component across the platform to smoothly catch broken/expired artwork URLs and display a fallback icon.

## Production Deployment & Anti-Bot Workarounds

After deploying Beehive Music to production, YouTube blocked automated stream traffic, resulting in errors like "Sign in to confirm you're not a bot".

### Workarounds Implemented:
1. **YouTube Music Primary:** Set the bot default search to `ytmsearch`.
2. **Bundled YouTube source:** The pinned Lavalink image installs and checksum-verifies the `youtube-source` plugin.
3. **YT-Cipher Service:** A pinned self-hosted `yt-cipher` service handles signature logic. YouTube OAuth is currently disabled in `infra/lavalink/application.yml`.

*Note: `beehive-yt-cipher` is an internal helper container and does not expose a public port. Ensure `.env.server` (containing OAuth & Cipher keys) is never committed.*

## Current Implementation Notes

- The web dashboard is wrapped in `GuildProvider` and `PlayerProvider`.
- Player state and remote controls are consumed through `PlayerContext.tsx`.
- Do not add page-specific player WebSockets unless strictly necessary. Queue actions use the shared `PlayerContext.sendCommand`.
- Bot-side queue command handling lives in `apps/bot/src/index.ts` under the `web_command:*` Redis subscriber.

## Directory Structure
```
/
├── apps/
│   ├── api/          # FastAPI Backend (Python)
│   ├── bot/          # Discord Bot (TypeScript)
│   └── web/          # Next.js Frontend (TypeScript/React)
├── infra/            # Nginx & Lavalink configurations
├── docker-compose.yml
├── context.md        # This comprehensive documentation file
└── README.md
```
