# 🐝 Beehive — Discord Music Bot Platform

A premium, production-grade Discord music bot system with a private web control panel.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (Reverse Proxy)                │
│                     beehive.teamsyndicate.org                       │
├──────────────┬──────────────────┬───────────────────────────┤
│  /api/*      │   /              │   WebSocket               │
│  FastAPI     │   Next.js        │   Realtime                │
│  Port 8001   │   Port 3000      │   Player State            │
├──────────────┴──────────────────┴───────────────────────────┤
│                     Redis (PubSub + Cache)                   │
├─────────────────────────────────────────────────────────────┤
│  Discord Bot (Node.js/TS)  ←→  Lavalink v4 (Audio)         │
├─────────────────────────────────────────────────────────────┤
│                     PostgreSQL 16                            │
└─────────────────────────────────────────────────────────────┘
```

## Services

| Service      | Stack                    | Default port |
|:-------------|:-------------------------|:-------------|
| **Bot**      | Node.js + TypeScript     | —     |
| **API**      | Python FastAPI           | 8001 (loopback) |
| **Web**      | Next.js + Tailwind CSS   | 3000 (loopback) |
| **Lavalink** | Java + Lavalink v4       | 2333 (loopback) |
| **Postgres** | PostgreSQL 16            | 5432 (internal) |
| **Redis**    | Redis 7                  | 6380 → 6379 (loopback) |
| **Nginx**    | Reverse Proxy            | 80/443 (loopback locally) |

## Features

### Discord Bot
- **22 slash commands**: Play, Skip, Pause, Resume, Stop, Previous, NowPlaying, Volume, Seek, Search, Autoplay, Queue, Shuffle, Loop, Clear, Remove, Move, Jump, Playlist, Favorites, Help, Server Player
- **Lavalink v4** audio with Shoukaku client
- **Per-guild queues** with loop (off/track/queue), shuffle, history
- **Prefix command hints** (`!play` → suggests `/play`)
- **Web command receiver** via Redis pub/sub

### Web Control Panel
- **Premium dark UI** with glassmorphism and amber theme
- **Discord-only sign-in** (no password or public signup form)
- **Dashboard** with stats, recent activity, quick actions
- **Now Playing** with album art, controls, volume, progress bar
- **Playlists, Favorites, History** management
- **Server management** with role-based access
- **Settings** for Discord profile and active sessions
- **Admin panel** with user table and search

### API
- **JWT authentication** with refresh token rotation
- **Discord OAuth2 authentication** with exact callback validation
- **Session management** (list, revoke, revoke-all)
- **Full CRUD** for users, guilds, playlists, favorites
- **WebSocket** for realtime player state updates
- **Avatar upload** with storage abstraction

### Admin CLI
- **Interactive TUI** using Rich + InquirerPy
- User CRUD, password reset, MFA management
- Server access and role assignment  
- Session viewing and force-logout

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))

### Setup

1. **Clone & configure:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. In the Discord Developer Portal, register this exact OAuth2 redirect:
   `http://localhost:3000/auth/discord/callback`

3. **Build and start services (migrations run automatically):**
   ```bash
   docker compose up -d --build
   ```

4. **Confirm the API and music node are healthy:**
   ```bash
   docker compose ps
   ```

5. **Deploy slash commands:**
   ```bash
   docker compose exec bot node dist/deploy-commands.js
   ```

6. **Access the web panel:**
   - Development: `http://localhost:3000`
   - Production: follow [`DEPLOY_APP_ONLY.md`](./DEPLOY_APP_ONLY.md) and configure your public reverse proxy

## Development

```bash
# API (FastAPI)
cd apps/api && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8001

# Bot (TypeScript)
cd apps/bot && npm install && npm run dev

# Web (Next.js)
cd apps/web && npm install && npm run dev

# Admin CLI
cd scripts && pip install -r requirements.txt && python interactive_admin.py
```

## Environment

See `.env.example` for all required environment variables.

For environment details and the required matching Discord callback values, see [`env.md`](./env.md).

---

Built with ❤️ and 🐝
