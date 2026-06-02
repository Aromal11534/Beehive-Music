"""Authentication service — login, token management, MFA flows."""

import logging

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    verify_password, create_access_token, create_refresh_token,
    decode_refresh_token, hash_token, verify_totp, decrypt_totp_secret,
    verify_recovery_code,
)
from app.core.exceptions import (
    AuthenticationError, AccountLockedError, MFARequiredError
)
from app.core.redis import redis_client
from app.models.user import User, UserMfa, UserSession

logger = logging.getLogger(__name__)


LOGIN_ATTEMPT_PREFIX = "login_attempts:"
LOGIN_LOCKOUT_PREFIX = "login_lockout:"
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 900  # 15 minutes
MFA_TOKEN_PREFIX = "mfa_pending:"
MFA_TOKEN_EXPIRE = 300  # 5 minutes


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def login(self, username: str, password: str, ip: str | None = None, user_agent: str | None = None):
        """Authenticate user. Returns tokens or raises MFARequiredError."""
        # Check lockout
        lockout_key = f"{LOGIN_LOCKOUT_PREFIX}{username}"
        if await redis_client.exists(lockout_key):
            raise AccountLockedError()

        # Fetch user
        result = await self.db.execute(
            select(User).options(selectinload(User.mfa)).where(User.username == username)
        )
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.password_hash):
            await self._record_failed_attempt(username)
            logger.warning("Failed login attempt for username=%s ip=%s", username, ip)
            raise AuthenticationError("Invalid username or password")

        if not user.is_active:
            raise AuthenticationError("Account is deactivated")

        # Clear failed attempts on success
        await redis_client.delete(f"{LOGIN_ATTEMPT_PREFIX}{username}")

        # Check MFA
        if user.mfa and user.mfa.is_enabled:
            mfa_token = secrets.token_urlsafe(32)
            await redis_client.setex(
                f"{MFA_TOKEN_PREFIX}{mfa_token}", MFA_TOKEN_EXPIRE, str(user.id)
            )
            raise MFARequiredError(mfa_token=mfa_token)

        return await self._create_session(user, ip, user_agent)

    async def verify_mfa(self, mfa_token: str, code: str, ip: str | None = None, user_agent: str | None = None):
        """Verify MFA code after initial password auth."""
        user_id = await redis_client.get(f"{MFA_TOKEN_PREFIX}{mfa_token}")
        if not user_id:
            raise AuthenticationError("MFA session expired or invalid")

        result = await self.db.execute(
            select(User).options(selectinload(User.mfa)).where(User.id == int(user_id))
        )
        user = result.scalar_one_or_none()
        if not user or not user.mfa:
            raise AuthenticationError("User not found")

        secret = decrypt_totp_secret(user.mfa.totp_secret_encrypted)

        # Try TOTP code first
        if len(code) == 6 and verify_totp(secret, code):
            await redis_client.delete(f"{MFA_TOKEN_PREFIX}{mfa_token}")
            return await self._create_session(user, ip, user_agent)

        # Try recovery code
        if user.mfa.recovery_codes_hash:
            valid, updated_hashes = verify_recovery_code(code, user.mfa.recovery_codes_hash)
            if valid:
                user.mfa.recovery_codes_hash = updated_hashes
                await redis_client.delete(f"{MFA_TOKEN_PREFIX}{mfa_token}")
                return await self._create_session(user, ip, user_agent)

        raise AuthenticationError("Invalid MFA code")

    async def refresh_tokens(self, refresh_token: str, ip: str | None = None, user_agent: str | None = None):
        """Issue new access + refresh tokens from a valid refresh token."""
        try:
            payload = decode_refresh_token(refresh_token)
        except Exception:
            raise AuthenticationError("Invalid refresh token")

        token_hash = hash_token(refresh_token)
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.refresh_token_hash == token_hash,
                UserSession.revoked_at.is_(None),
            )
        )
        session = result.scalar_one_or_none()
        if not session or not session.is_active:
            raise AuthenticationError("Session expired or revoked")

        # Revoke old session
        session.revoked_at = datetime.now(timezone.utc)

        # Get user
        result = await self.db.execute(select(User).where(User.id == session.user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise AuthenticationError("User not found or inactive")

        return await self._create_session(user, ip, user_agent)

    async def logout(self, refresh_token: str):
        """Revoke a single session."""
        token_hash = hash_token(refresh_token)
        result = await self.db.execute(
            select(UserSession).where(UserSession.refresh_token_hash == token_hash)
        )
        session = result.scalar_one_or_none()
        if session:
            session.revoked_at = datetime.now(timezone.utc)

    async def logout_all(self, user_id: int):
        """Revoke all sessions for a user."""
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.revoked_at.is_(None),
            )
        )
        sessions = result.scalars().all()
        now = datetime.now(timezone.utc)
        for session in sessions:
            session.revoked_at = now

    async def _create_session(self, user: User, ip: str | None, user_agent: str | None) -> dict:
        """Create tokens and session record."""
        token_data = {"sub": str(user.id), "username": user.username, "is_admin": user.is_admin}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        session = UserSession(
            user_id=user.id,
            refresh_token_hash=hash_token(refresh_token),
            ip_address=ip,
            user_agent=user_agent[:512] if user_agent else None,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        self.db.add(session)

        user.last_login_at = datetime.now(timezone.utc)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user_id": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
            "mfa_required": False,
            "force_password_change": user.force_password_change,
        }

    async def _record_failed_attempt(self, username: str):
        """Track failed logins and enforce lockout."""
        key = f"{LOGIN_ATTEMPT_PREFIX}{username}"
        attempts = await redis_client.incr(key)
        await redis_client.expire(key, LOCKOUT_DURATION_SECONDS)
        if attempts >= MAX_LOGIN_ATTEMPTS:
            await redis_client.setex(
                f"{LOGIN_LOCKOUT_PREFIX}{username}", LOCKOUT_DURATION_SECONDS, "1"
            )

    async def get_active_sessions(self, user_id: int) -> list[UserSession]:
        """Get all active sessions for a user."""
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > datetime.now(timezone.utc),
            ).order_by(UserSession.created_at.desc())
        )
        return list(result.scalars().all())

    async def revoke_session(self, session_id: int, user_id: int):
        """Revoke a specific session."""
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.id == session_id,
                UserSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if session:
            session.revoked_at = datetime.now(timezone.utc)
