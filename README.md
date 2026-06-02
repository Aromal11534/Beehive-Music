# 🐝 Beehive — Discord Music Bot Platform

A premium, production-grade Discord music bot system with a private web control panel.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (Reverse Proxy)                │
│                     beehive.syncify.in                       │
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

| Service      | Stack                    | Port  |
|:-------------|:-------------------------|:------|
| **Bot**      | Node.js + TypeScript     | —     |
| **API**      | Python FastAPI           | 8001  |
| **Web**      | Next.js + Tailwind CSS   | 3000  |
| **Lavalink** | Java + Lavalink v4       | 2333  |
| **Postgres** | PostgreSQL 16            | 5432  |
| **Redis**    | Redis 7                  | 6379  |
| **Nginx**    | Reverse Proxy + SSL      | 80/443|

## Features

### Discord Bot
- **21 slash commands**: Play, Skip, Pause, Resume, Stop, Previous, NowPlaying, Volume, Seek, Search, Autoplay, Queue, Shuffle, Loop, Clear, Remove, Move, Jump, Playlist, Favorites, Help
- **Lavalink v4** audio with Shoukaku client
- **Per-guild queues** with loop (off/track/queue), shuffle, history
- **Prefix command hints** (`!play` → suggests `/play`)
- **Web command receiver** via Redis pub/sub

### Web Control Panel
- **Premium dark UI** with glassmorphism and amber theme
- **Login-only system** (no public signup)
- **MFA support** (TOTP with QR code + recovery codes)
- **Dashboard** with stats, recent activity, quick actions
- **Now Playing** with album art, controls, volume, progress bar
- **Playlists, Favorites, History** management
- **Server management** with role-based access
- **Settings** (profile, security, preferences)
- **Admin panel** with user table and search

### API
- **JWT authentication** with refresh token rotation
- **Account lockout** (5 failed attempts → 15min lockout)
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

2. **Start services:**
   ```bash
   docker compose up -d
   ```

3. **Run database migrations:**
   ```bash
   docker compose exec api alembic upgrade head
   ```

4. **Create your first admin user:**
   ```bash
   docker compose exec api python scripts/interactive_admin.py
   ```

5. **Deploy slash commands:**
   ```bash
   docker compose exec bot npm run deploy-commands
   ```

6. **Access the web panel:**
   - Development: `http://localhost:3000`
   - Production: `https://beehive.syncify.in`

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

## Domain

This project is deployed at **beehive.syncify.in**.

---

Built with ❤️ and 🐝
