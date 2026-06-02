"""Guild and server settings service."""

from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ConflictError
from app.models.guild import DiscordGuild, UserGuildAccess, ServerSettings
from app.models.user import User


class GuildService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_guild(self, discord_guild_id: str, name: str | None = None, icon_url: str | None = None) -> DiscordGuild:
        existing = await self.db.execute(
            select(DiscordGuild).where(DiscordGuild.discord_guild_id == discord_guild_id)
        )
        if existing.scalar_one_or_none():
            raise ConflictError(f"Guild {discord_guild_id} already registered")

        guild = DiscordGuild(discord_guild_id=discord_guild_id, name=name, icon_url=icon_url)
        self.db.add(guild)
        await self.db.flush()

        # Create default settings
        settings = ServerSettings(guild_id=guild.id)
        self.db.add(settings)
        await self.db.flush()

        return guild

    async def sync_guilds(self, guilds_data: list[dict]) -> list[DiscordGuild]:
        """Upsert guilds from bot and auto-grant admin users access."""
        synced = []

        # Get all admin users
        admin_result = await self.db.execute(
            select(User).where(User.is_admin == True, User.is_active == True)
        )
        admin_users = list(admin_result.scalars().all())

        for g in guilds_data:
            discord_id = g.get("discord_guild_id", "")
            name = g.get("name")
            icon_url = g.get("icon_url")

            if not discord_id:
                continue

            result = await self.db.execute(
                select(DiscordGuild).where(DiscordGuild.discord_guild_id == discord_id)
            )
            guild = result.scalar_one_or_none()

            if guild:
                # Update name/icon if changed
                if name and guild.name != name:
                    guild.name = name
                if icon_url and guild.icon_url != icon_url:
                    guild.icon_url = icon_url
                guild.updated_at = datetime.now(timezone.utc)
            else:
                # Create new guild
                guild = DiscordGuild(discord_guild_id=discord_id, name=name, icon_url=icon_url)
                self.db.add(guild)
                await self.db.flush()

                # Create default settings
                settings = ServerSettings(guild_id=guild.id)
                self.db.add(settings)
                await self.db.flush()

            # Auto-grant admin users access
            for admin in admin_users:
                existing_access = await self.db.execute(
                    select(UserGuildAccess).where(
                        UserGuildAccess.user_id == admin.id,
                        UserGuildAccess.guild_id == guild.id,
                    )
                )
                if not existing_access.scalar_one_or_none():
                    access = UserGuildAccess(user_id=admin.id, guild_id=guild.id, role="admin")
                    self.db.add(access)

            synced.append(guild)

        await self.db.flush()
        return synced

    async def get_guild(self, guild_id: int) -> DiscordGuild:
        result = await self.db.execute(
            select(DiscordGuild).options(selectinload(DiscordGuild.settings)).where(DiscordGuild.id == guild_id)
        )
        guild = result.scalar_one_or_none()
        if not guild:
            raise NotFoundError("Guild not found")
        return guild

    async def get_guild_by_discord_id(self, discord_guild_id: str) -> DiscordGuild | None:
        result = await self.db.execute(
            select(DiscordGuild).where(DiscordGuild.discord_guild_id == discord_guild_id)
        )
        return result.scalar_one_or_none()

    async def list_guilds(self):
        result = await self.db.execute(select(DiscordGuild).order_by(DiscordGuild.name))
        return list(result.scalars().all())

    async def update_guild(self, guild_id: int, name: str | None = None, icon_url: str | None = None) -> DiscordGuild:
        guild = await self.get_guild(guild_id)
        if name is not None:
            guild.name = name
        if icon_url is not None:
            guild.icon_url = icon_url
        guild.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return guild

    async def delete_guild(self, guild_id: int):
        guild = await self.get_guild(guild_id)
        await self.db.delete(guild)
        await self.db.flush()

    # ── User Access ──────────────────────────────────────
    async def grant_access(self, user_id: int, guild_id: int, role: str = "viewer") -> UserGuildAccess:
        existing = await self.db.execute(
            select(UserGuildAccess).where(
                UserGuildAccess.user_id == user_id,
                UserGuildAccess.guild_id == guild_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ConflictError("User already has access to this guild")

        access = UserGuildAccess(user_id=user_id, guild_id=guild_id, role=role)
        self.db.add(access)
        await self.db.flush()
        return access

    async def revoke_access(self, user_id: int, guild_id: int):
        result = await self.db.execute(
            select(UserGuildAccess).where(
                UserGuildAccess.user_id == user_id,
                UserGuildAccess.guild_id == guild_id,
            )
        )
        access = result.scalar_one_or_none()
        if access:
            await self.db.delete(access)
            await self.db.flush()

    async def get_user_guilds(self, user_id: int) -> list[UserGuildAccess]:
        result = await self.db.execute(
            select(UserGuildAccess)
            .options(selectinload(UserGuildAccess.guild))
            .where(UserGuildAccess.user_id == user_id)
        )
        return list(result.scalars().all())

    async def check_access(self, user_id: int, guild_id: int) -> UserGuildAccess | None:
        result = await self.db.execute(
            select(UserGuildAccess).where(
                UserGuildAccess.user_id == user_id,
                UserGuildAccess.guild_id == guild_id,
            )
        )
        return result.scalar_one_or_none()

    # ── Server Settings ──────────────────────────────────
    async def get_settings(self, guild_id: int) -> ServerSettings:
        result = await self.db.execute(
            select(ServerSettings).where(ServerSettings.guild_id == guild_id)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            settings = ServerSettings(guild_id=guild_id)
            self.db.add(settings)
            await self.db.flush()
        return settings

    async def update_settings(self, guild_id: int, **kwargs) -> ServerSettings:
        settings = await self.get_settings(guild_id)
        for key, value in kwargs.items():
            if value is not None and hasattr(settings, key):
                setattr(settings, key, value)
        settings.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return settings
