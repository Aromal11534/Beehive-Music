# Beehive Music System Context

## Overview
Beehive Music is a full-stack Discord music bot with a real-time web dashboard. The project allows users to play music in Discord voice channels, control the queue from a web interface, manage playlists, and save favorite tracks.

## Architecture & Tech Stack

### 1. Web Application (`/apps/web`)
- **Framework:** Next.js (React)
- **Styling:** Tailwind CSS
- **Features:** 
  - Real-time player state visualization (Now Playing, Queue).
  - Dashboard with recent activity and server stats.
  - Playlist and Favorites management.
  - Discord OAuth2 for authentication.
  - Interactive UI with drag-and-drop queue reordering (via `dnd-kit`).

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
  - Manages Discord OAuth token exchange and session validation.
  - Provides WebSocket connections to stream real-time player state from the Bot to the Web UI.

### 4. Infrastructure
- **Docker Compose:** The entire stack is containerized using `docker-compose.yml`.
  - `web` (Next.js)
  - `api` (FastAPI)
  - `bot` (Discord.js)
  - `postgres` (Database)
  - `redis` (PubSub & Cache)
  - `lavalink` (Audio streaming node)
  - `nginx` & `certbot` (Reverse proxy and SSL)

---

## Core Data Flow (Real-Time Control)

A critical aspect of this system is how the Web UI controls the Discord Bot without a direct API route between them. This is achieved via **Redis Pub/Sub**.

1. **State Streaming (Bot -> Web):**
   - The Bot maintains the source of truth for the music player state.
   - Every time the state changes (track starts, pauses, queue changes), the Bot publishes a JSON payload to Redis under the key `player_state:{guild_id}`.
   - The FastAPI backend subscribes to this key and streams the state over an open WebSocket connection to the Next.js web client.

2. **Remote Control (Web -> Bot):**
   - When a user clicks a button on the Web UI (e.g., Pause, Skip, Move Queue Item), the web client sends a JSON action payload through the WebSocket to the FastAPI backend.
   - FastAPI takes this payload and publishes it to a Redis channel named `web_command:{guild_id}`.
   - The Node.js Discord Bot subscribes to `web_command:*`. When it receives a command, it parses the action (e.g., `play`, `pause`, `remove`, `move`, `jump`) and executes the corresponding method on its internal `MusicManager` or `QueueManager`.

---

## Recent Development History

- **Web UI Overhaul:** Upgraded the visual aesthetics of the Dashboard, Playlists, Favorites, and Queue pages to use a premium glass-morphism design with Tailwind.
- **Queue Manipulation:** 
  - Implemented `dnd-kit` in the web application to allow drag-and-drop reordering of tracks in the queue.
  - Added backend bot support for `move`, `remove`, and `jump` actions over Redis Pub/Sub to sync the UI queue state with the Lavalink queue.
- **Favorites System:** 
  - Created a Favorites page matching the Playlists aesthetic.
  - Added inline "Favorite" star buttons across the Queue and Now Playing pages, allowing one-click track saving.
- **Playlist Management:** 
  - Fixed payload schemas so tracks from the queue and now playing views can be properly appended to existing user playlists.

---

## Directory Structure
```
/
├── apps/
│   ├── api/          # FastAPI Backend (Python)
│   │   ├── app/      # Core API logic, Routers, DB Models, WebSockets
│   │   └── ...
│   ├── bot/          # Discord Bot (TypeScript)
│   │   ├── src/      # Bot logic, MusicManager, QueueManager
│   │   └── ...
│   └── web/          # Next.js Frontend (TypeScript/React)
│       ├── src/      # Pages, Components, Lib
│       └── ...
├── infra/            # Nginx & Lavalink configurations
├── docker-compose.yml
└── README.md
```
