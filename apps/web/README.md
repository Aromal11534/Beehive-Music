# Beehive Web

Next.js dashboard for the Beehive Discord music bot. Authentication is Discord OAuth2 only; the API and Redis-backed bot bridge must be running for authenticated player controls.

## Local development

Set `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_DISCORD_CLIENT_ID`, and `NEXT_PUBLIC_DISCORD_REDIRECT_URI` in the repository `.env`.

The redirect must exactly match `DISCORD_REDIRECT_URI` in the API and an OAuth2 Redirect registered in the Discord Developer Portal. The local default is `http://localhost:3000/auth/discord/callback`.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Run `npm run lint` and `npm run build` before deployment.
