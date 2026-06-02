"""User management service."""

from datetime import datetime, timezone
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password, verify_password
from app.core.exceptions import NotFoundError, ConflictError, AuthenticationError
from app.models.user import User, UserMfa
from app.schemas.user import UserCreate, UserUpdate, UserProfileUpdate


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_user(self, data: UserCreate) -> User:
        # Check uniqueness
        existing = await self.db.execute(select(User).where(User.username == data.username))
        if existing.scalar_one_or_none():
            raise ConflictError(f"Username '{data.username}' already exists")

        user = User(
            username=data.username,
            display_name=data.display_name,
            email=data.email,
            password_hash=hash_password(data.password),
            is_admin=data.is_admin,
        )
        self.db.add(user)
        await self.db.flush()

        # Create MFA record (disabled by default)
        mfa = UserMfa(user_id=user.id, is_enabled=False)
        self.db.add(mfa)
        await self.db.flush()

        return user

    async def get_user(self, user_id: int) -> User:
        result = await self.db.execute(
            select(User).options(selectinload(User.mfa)).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("User not found")
        return user

    async def get_user_by_username(self, username: str) -> User | None:
        result = await self.db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def list_users(self, page: int = 1, page_size: int = 20, search: str | None = None):
        query = select(User).options(selectinload(User.mfa))

        if search:
            query = query.where(
                or_(
                    User.username.ilike(f"%{search}%"),
                    User.display_name.ilike(f"%{search}%"),
                    User.email.ilike(f"%{search}%"),
                )
            )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_query)).scalar()

        # Paginate
        query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(query)
        users = list(result.scalars().all())

        return users, total

    async def update_user(self, user_id: int, data: UserUpdate) -> User:
        user = await self.get_user(user_id)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(user, key, value)
        user.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return user

    async def update_profile(self, user_id: int, data: UserProfileUpdate) -> User:
        user = await self.get_user(user_id)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(user, key, value)
        user.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return user

    async def change_password(self, user_id: int, current_password: str, new_password: str) -> bool:
        user = await self.get_user(user_id)
        if not verify_password(current_password, user.password_hash):
            raise AuthenticationError("Current password is incorrect")
        user.password_hash = hash_password(new_password)
        user.force_password_change = False
        user.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    async def reset_password(self, user_id: int, new_password: str) -> bool:
        """Admin-only password reset (no current password required)."""
        user = await self.get_user(user_id)
        user.password_hash = hash_password(new_password)
        user.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    async def delete_user(self, user_id: int) -> bool:
        user = await self.get_user(user_id)
        await self.db.delete(user)
        await self.db.flush()
        return True

    async def update_avatar(self, user_id: int, avatar_path: str) -> User:
        user = await self.get_user(user_id)
        user.avatar_path = avatar_path
        user.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return user

    async def remove_avatar(self, user_id: int) -> User:
        user = await self.get_user(user_id)
        user.avatar_path = None
        user.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return user
