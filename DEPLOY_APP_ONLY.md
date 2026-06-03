# App-Only Deployment

Use this when PostgreSQL, Redis, and nginx already exist on the server.

## Services Started By This Compose File

- `beehive-api` on host port `8001`
- `beehive-web` on host port `3000`
- `beehive-bot`
- `beehive-lavalink` on host port `2333`

The compose file attaches Beehive services to the existing `baota_net` Docker bridge network and publishes ports explicitly so aaPanel can show container IPs and port mappings. Beehive connects to the existing Redis and Postgres containers on that network.

## Setup

1. Create the server env file:

```bash
cp env.server.example .env.server
```

2. Edit `.env.server` and set the real Postgres, Redis, Discord, JWT, Lavalink, and MFA values.

3. Start the application services:

```bash
docker compose --env-file .env.server -f docker-compose.app.yml up -d --build
```

4. Run database migrations:

```bash
docker compose --env-file .env.server -f docker-compose.app.yml exec api alembic upgrade head
```

5. Create/administer users:

```bash
docker compose --env-file .env.server -f docker-compose.app.yml run --rm admin
```

6. Deploy Discord slash commands:

```bash
docker compose --env-file .env.server -f docker-compose.app.yml exec bot node dist/deploy-commands.js
```

## nginx Targets

Point your host nginx reverse proxy to:

- `/api/` -> `http://127.0.0.1:8001`
- `/api/v1/player/ws/` -> `http://127.0.0.1:8001` with WebSocket upgrade headers
- `/` -> `http://127.0.0.1:3000`

## Health Checks

```bash
curl http://127.0.0.1:8001/api/v1/health
curl http://127.0.0.1:3000
```
