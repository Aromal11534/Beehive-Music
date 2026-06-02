"""MFA management service."""

import io
import base64
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import qrcode

from app.core.security import (
    generate_totp_secret, get_totp_uri, encrypt_totp_secret,
    decrypt_totp_secret, verify_totp, generate_recovery_codes,
    hash_recovery_codes, verify_password,
)
from app.core.exceptions import AuthenticationError, NotFoundError
from app.models.user import User, UserMfa


class MfaService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def setup_mfa(self, user_id: int):
        """Generate TOTP secret, QR code, and recovery codes. Does NOT enable MFA yet."""
        user = await self._get_user(user_id)
        secret = generate_totp_secret()
        totp_uri = get_totp_uri(secret, user.username)

        # Generate QR code as base64
        qr = qrcode.make(totp_uri)
        buffer = io.BytesIO()
        qr.save(buffer, format="PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()

        recovery_codes = generate_recovery_codes()

        return {
            "secret": secret,
            "totp_uri": totp_uri,
            "qr_code_base64": qr_base64,
            "recovery_codes": recovery_codes,
        }

    async def enable_mfa(self, user_id: int, code: str, secret: str):
        """Verify the TOTP code and enable MFA."""
        if not verify_totp(secret, code):
            raise AuthenticationError("Invalid TOTP code")

        mfa = await self._get_or_create_mfa(user_id)
        recovery_codes = generate_recovery_codes()

        mfa.is_enabled = True
        mfa.totp_secret_encrypted = encrypt_totp_secret(secret)
        mfa.recovery_codes_hash = hash_recovery_codes(recovery_codes)
        mfa.enabled_at = datetime.now(timezone.utc)
        mfa.updated_at = datetime.now(timezone.utc)
        await self.db.flush()

        return recovery_codes

    async def disable_mfa(self, user_id: int, password: str, code: str):
        """Disable MFA after verifying password and TOTP code."""
        user = await self._get_user(user_id)
        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid password")

        mfa = await self._get_mfa(user_id)
        if not mfa or not mfa.is_enabled:
            raise NotFoundError("MFA is not enabled")

        secret = decrypt_totp_secret(mfa.totp_secret_encrypted)
        if not verify_totp(secret, code):
            raise AuthenticationError("Invalid TOTP code")

        mfa.is_enabled = False
        mfa.totp_secret_encrypted = None
        mfa.recovery_codes_hash = None
        mfa.enabled_at = None
        mfa.updated_at = datetime.now(timezone.utc)
        await self.db.flush()

    async def regenerate_recovery_codes(self, user_id: int, password: str):
        """Regenerate recovery codes."""
        user = await self._get_user(user_id)
        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid password")

        mfa = await self._get_mfa(user_id)
        if not mfa or not mfa.is_enabled:
            raise NotFoundError("MFA is not enabled")

        codes = generate_recovery_codes()
        mfa.recovery_codes_hash = hash_recovery_codes(codes)
        mfa.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return codes

    async def get_mfa_status(self, user_id: int):
        mfa = await self._get_mfa(user_id)
        return {
            "is_enabled": mfa.is_enabled if mfa else False,
            "enabled_at": str(mfa.enabled_at) if mfa and mfa.enabled_at else None,
        }

    async def admin_reset_mfa(self, user_id: int):
        """Admin-only: force-disable a user's MFA."""
        mfa = await self._get_mfa(user_id)
        if mfa:
            mfa.is_enabled = False
            mfa.totp_secret_encrypted = None
            mfa.recovery_codes_hash = None
            mfa.enabled_at = None
            mfa.updated_at = datetime.now(timezone.utc)
            await self.db.flush()

    async def _get_user(self, user_id: int) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("User not found")
        return user

    async def _get_mfa(self, user_id: int) -> UserMfa | None:
        result = await self.db.execute(select(UserMfa).where(UserMfa.user_id == user_id))
        return result.scalar_one_or_none()

    async def _get_or_create_mfa(self, user_id: int) -> UserMfa:
        mfa = await self._get_mfa(user_id)
        if not mfa:
            mfa = UserMfa(user_id=user_id, is_enabled=False)
            self.db.add(mfa)
            await self.db.flush()
        return mfa
