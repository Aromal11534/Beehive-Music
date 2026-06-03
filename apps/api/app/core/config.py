"""Beehive API — Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────
    app_name: str = "Beehive API"
    app_env: str = Field(default="development", alias="FASTAPI_ENV")
    debug: bool = Field(default=True)
    log_level: str = Field(default="debug", alias="LOG_LEVEL")
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

    # ── SMTP / Email ─────────────────────────────────────
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int | None = Field(default=587, alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_from_email: str | None = Field(default="noreply@example.com", alias="SMTP_FROM_EMAIL")
    smtp_from_name: str | None = Field(default="Beehive", alias="SMTP_FROM_NAME")
    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
