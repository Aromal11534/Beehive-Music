"""Beehive API — Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from pydantic import Field, model_validator
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────
    app_name: str = "Beehive API"
    app_env: str = Field(default="development", alias="FASTAPI_ENV")
    debug: bool = Field(default=False, alias="DEBUG")
    log_level: str = Field(default="info", alias="LOG_LEVEL")
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8001, alias="API_PORT")

    # ── Database ─────────────────────────────────────────
    postgres_host: str = Field(default="localhost", alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_user: str = Field(default="beehive", alias="POSTGRES_USER")
    postgres_password: str = Field(default="beehive_dev_password", alias="POSTGRES_PASSWORD")
    postgres_db: str = Field(default="beehive", alias="POSTGRES_DB")

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        """Synchronous URL for Alembic migrations and CLI tools."""
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # ── Redis ────────────────────────────────────────────
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # ── JWT ──────────────────────────────────────────────
    jwt_secret_key: str = Field(default="change-me-in-production", alias="JWT_SECRET_KEY")
    jwt_refresh_secret_key: str = Field(default="change-me-refresh", alias="JWT_REFRESH_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_access_expire_minutes: int = Field(default=30, alias="JWT_ACCESS_EXPIRE_MINUTES")
    jwt_refresh_expire_days: int = Field(default=7, alias="JWT_REFRESH_EXPIRE_DAYS")

    # ── MFA ──────────────────────────────────────────────
    mfa_encryption_key: str = Field(default="", alias="MFA_ENCRYPTION_KEY")

    # ── Avatar Storage ───────────────────────────────────
    avatar_storage_path: str = Field(default="./storage/avatars", alias="AVATAR_STORAGE_PATH")
    avatar_max_size_mb: int = Field(default=5, alias="AVATAR_MAX_SIZE_MB")

    # ── CORS ─────────────────────────────────────────────
    cors_allowed_origins: str = Field(
        default="http://localhost:3000", alias="CORS_ALLOWED_ORIGINS"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    # ── API ──────────────────────────────────────────────
    api_base_url: str = Field(default="http://localhost:8001", alias="API_BASE_URL")
    internal_api_token: str | None = Field(default=None, alias="INTERNAL_API_TOKEN")
    internal_api_token_file: str | None = Field(
        default=None,
        alias="INTERNAL_API_TOKEN_FILE",
    )

    # Discord OAuth
    discord_client_id: str | None = Field(default=None, alias="DISCORD_CLIENT_ID")
    discord_client_secret: str | None = Field(default=None, alias="DISCORD_CLIENT_SECRET")
    discord_redirect_uri: str | None = Field(default=None, alias="DISCORD_REDIRECT_URI")
    public_discord_redirect_uri: str | None = Field(
        default=None,
        alias="NEXT_PUBLIC_DISCORD_REDIRECT_URI",
    )

    # ── SMTP / Email ─────────────────────────────────────
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int | None = Field(default=587, alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_from_email: str | None = Field(default="noreply@example.com", alias="SMTP_FROM_EMAIL")
    smtp_from_name: str | None = Field(default="Beehive", alias="SMTP_FROM_NAME")
    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")

    @property
    def allowed_discord_redirect_uri(self) -> str:
        return (
            self.discord_redirect_uri
            or self.public_discord_redirect_uri
            or f"{self.frontend_url.rstrip('/')}/auth/discord/callback"
        )

    @model_validator(mode="after")
    def reject_unsafe_production_secrets(self):
        """Fail closed when production is started with shipped or weak secrets."""
        if self.internal_api_token_file:
            try:
                file_token = Path(self.internal_api_token_file).read_text(
                    encoding="utf-8"
                ).strip()
                if file_token:
                    self.internal_api_token = file_token
            except OSError:
                # Non-Docker deployments may intentionally use the environment.
                pass

        if self.app_env.lower() != "production":
            return self

        weak_values = {
            "",
            "change-me-in-production",
            "change-me-refresh",
            "your_jwt_secret_key_here_min_32_chars",
            "your_jwt_refresh_secret_key_here_min_32_chars",
            "generate_a_separate_internal_service_token",
            "replace_with_at_least_32_random_characters",
            "replace_with_a_different_32_character_secret",
            "replace_with_a_third_independent_32_character_secret",
        }
        secret_fields = {
            "JWT_SECRET_KEY": self.jwt_secret_key,
            "JWT_REFRESH_SECRET_KEY": self.jwt_refresh_secret_key,
            "INTERNAL_API_TOKEN": self.internal_api_token or "",
        }
        invalid = [
            name
            for name, value in secret_fields.items()
            if value in weak_values or len(value) < 32
        ]
        if invalid:
            raise ValueError(
                "Production requires unique secrets of at least 32 characters: "
                + ", ".join(invalid)
            )
        if len(set(secret_fields.values())) != len(secret_fields):
            raise ValueError(
                "Production JWT access, JWT refresh, and internal API secrets must be different"
            )
        return self

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
