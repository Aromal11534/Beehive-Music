"""Use timezone-aware timestamps

Revision ID: 20260602_tz_timestamps
Revises: c153cd8d28b7
Create Date: 2026-06-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260602_tz_timestamps"
down_revision: Union[str, None] = "c153cd8d28b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TIMESTAMP_COLUMNS = {
    "users": ["created_at", "updated_at", "last_login_at"],
    "discord_guilds": ["created_at", "updated_at"],
    "user_mfa": ["enabled_at", "updated_at"],
    "user_sessions": ["created_at", "expires_at", "revoked_at"],
    "server_settings": ["created_at", "updated_at"],
    "user_guild_access": ["created_at"],
    "playlists": ["created_at", "updated_at"],
    "playlist_tracks": ["created_at"],
    "favorites": ["created_at"],
    "play_history": ["played_at"],
    "audit_logs": ["created_at"],
}


def upgrade() -> None:
    for table, columns in TIMESTAMP_COLUMNS.items():
        for column in columns:
            op.alter_column(
                table,
                column,
                type_=sa.DateTime(timezone=True),
                existing_type=sa.DateTime(),
                postgresql_using=f"{column} AT TIME ZONE 'UTC'",
            )


def downgrade() -> None:
    for table, columns in TIMESTAMP_COLUMNS.items():
        for column in columns:
            op.alter_column(
                table,
                column,
                type_=sa.DateTime(),
                existing_type=sa.DateTime(timezone=True),
                postgresql_using=f"{column} AT TIME ZONE 'UTC'",
            )
