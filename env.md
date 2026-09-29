# Configuration Guide (`.env`)

This project uses an `.env` file to securely store sensitive configuration data like API keys, database passwords, and encryption keys. 

> **Canonical template:** See [`.env.example`](./.env.example) for all available variables with defaults. This guide explains how to obtain each credential.

**Never commit your `.env` file to version control (GitHub).**

## How to setup your environment

1. In the root directory of the project, duplicate the `.env.example` file.
2. Rename the duplicated file to exactly `.env`.
   - *On Windows/Linux/Mac terminal:* `cp .env.example .env`
3. Open `.env` in your text editor and fill in the required blanks using the guide below.

---

## Required Credentials & How to Get Them

### 1. Discord Bot Configuration
These credentials allow the application to control, run, and identify your Discord bot.

*   **`DISCORD_BOT_TOKEN`**
    *   **What it is:** The master password/authentication key for your Discord bot.
    *   **How to get it:** 
        1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
        2. Select your application (or create a new one).
        3. Go to the **Bot** tab on the left sidebar.
        4. Click **Reset Token** (or **Copy** if recently generated). Paste this into your `.env`.
*   **`DISCORD_CLIENT_ID`**
    *   **What it is:** The public identification tag for your Discord application.
    *   **How to get it:** In the Developer Portal, go to the **OAuth2** -> **General** tab and copy the **Client ID**.
*   **`NEXT_PUBLIC_DISCORD_REDIRECT_URI`**
    *   **What it is:** The exact browser callback used for Discord login and account sync.
    *   **How to configure it:** Add the same value under **OAuth2** -> **Redirects** in the Discord Developer Portal. For local Docker development use `http://localhost:3000/auth/discord/callback`; production should use `https://beehive.teamsyndicate.org/auth/discord/callback`.
*   **`DISCORD_DEV_GUILD_ID`** *(Optional)*
    *   **What it is:** The Server ID of your personal testing server. Using this makes Slash Commands update instantly during development instead of taking up to an hour globally.
    *   **How to get it:** Enable "Developer Mode" in your Discord client settings (Advanced), then right-click your server's icon in Discord and click **Copy Server ID**.

### 2. Security & Encryption Keys
These keys are used by the backend to safely encrypt user login sessions and Multi-Factor Authentication (MFA) codes. **Do not use simple words for these.**

*   **`JWT_SECRET_KEY`** & **`JWT_REFRESH_SECRET_KEY`**
    *   **What it is:** Cryptographic hashes used to sign and verify user login sessions.
    *   **How to get it:** Generate a random 32+ character secure string. You can generate them quickly by running this command twice in your terminal:
        ```bash
        python -c "import secrets; print(secrets.token_hex(32))"
        ```
*   **`MFA_ENCRYPTION_KEY`**
    *   **What it is:** A specialized Fernet key used to uniquely encrypt sensitive user MFA seed recovery codes before storing them in the database.
    *   **How to get it:** You must generate a highly specific valid 32-byte url-safe base64-encoded key. Open a terminal where Python is installed and run:
        ```bash
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
        ```

### 3. Databases and Microservices
These passwords act as the internal security connecting the different containerized pieces of your application (Database, Caching, and Music Nodes).

*   **`LAVALINK_PASSWORD`**
    *   **What it is:** The password your Discord bot uses to connect to the internal Lavalink music processing server.
    *   **How to get it:** Invent a secure, memorable password (e.g., `MySuperSecretLavalinkPass123`).
*   **`POSTGRES_PASSWORD`**
    *   **What it is:** The password for the `beehive` PostgreSQL user used by the app to interact with the database.
    *   **How to get it:** Invent a strong password.

---
*Once you have populated your `.env` file, carefully save it. Your project is now securely configured and ready to be built or run locally!*
