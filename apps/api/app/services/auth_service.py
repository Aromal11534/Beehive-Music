"""Authentication service — login, token management, MFA flows."""

import logging

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
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

        from sqlalchemy import or_
        # Fetch user
        result = await self.db.execute(
            select(User).options(selectinload(User.mfa)).where(
                or_(User.username == username, User.email == username)
            )
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

        parsed_user_agent = user_agent[:512] if user_agent else None

        # Revoke existing active sessions from the same device (IP + User Agent) to prevent duplicates
        await self.db.execute(
            update(UserSession)
            .where(
                UserSession.user_id == user.id,
                UserSession.ip_address == ip,
                UserSession.user_agent == parsed_user_agent,
                UserSession.revoked_at.is_(None)
            )
            .values(revoked_at=datetime.now(timezone.utc))
        )

        session = UserSession(
            user_id=user.id,
            refresh_token_hash=hash_token(refresh_token),
            ip_address=ip,
            user_agent=parsed_user_agent,
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

    async def initiate_password_reset(self, email: str):
        """Generate a password reset token for the given email.
        
        Always succeeds silently to prevent email enumeration.
        In production, send the token via email. For now, log it.
        """
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()
        if not user:
            # Don't reveal whether the email exists
            return

        reset_token = secrets.token_urlsafe(32)
        await redis_client.setex(
            f"password_reset:{reset_token}", 1800, str(user.id)  # 30 minutes
        )
        logger.info("Password reset token for user_id=%s: %s", user.id, reset_token)

        try:
            from app.services.email_service import EmailService
            EmailService().send_password_reset_email(email, reset_token)
        except Exception as e:
            logger.error(f"Error sending password reset email: {e}")

    async def reset_password_with_token(self, token: str, new_password: str):
        """Reset password using a valid reset token."""
        user_id = await redis_client.get(f"password_reset:{token}")
        if not user_id:
            raise AuthenticationError("Reset token is invalid or expired")

        result = await self.db.execute(
            select(User).where(User.id == int(user_id))
        )
        user = result.scalar_one_or_none()
        if not user:
            raise AuthenticationError("User not found")

        from app.core.security import hash_password
        user.password_hash = hash_password(new_password)
        user.updated_at = datetime.now(timezone.utc)
        await redis_client.delete(f"password_reset:{token}")

    async def login_with_discord(self, discord_id: str, email: str | None, username: str, ip: str | None = None, user_agent: str | None = None) -> dict:
        """Authenticate or register user via Discord OAuth."""
        # 1. Try finding by discord_id
        result = await self.db.execute(select(User).where(User.discord_id == discord_id))
        user = result.scalar_one_or_none()
        
        if not user and email:
            # 2. Try finding by email
            result = await self.db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            if user:
                # Link account
                user.discord_id = discord_id
                self.db.add(user)
        
        if not user:
            # 3. Create new user
            from app.core.security import hash_password
            
            # Ensure unique username
            base_username = username
            counter = 1
            while True:
                existing = await self.db.execute(select(User).where(User.username == username))
                if not existing.scalar_one_or_none():
                    break
                username = f"{base_username}{counter}"
                counter += 1
                
            random_password = secrets.token_urlsafe(32)
            user = User(
                username=username,
                email=email,
                display_name=username,
                password_hash=hash_password(random_password),
                discord_id=discord_id,
                is_admin=False
            )
            self.db.add(user)
            await self.db.flush()

        if not user.is_active:
            raise AuthenticationError("Account is deactivated")
            
        await self.db.commit()

        return await self._create_session(user, ip, user_agent)

