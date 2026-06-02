"""User schemas."""

from datetime import datetime
from pydantic import BaseModel, Field, EmailStr


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
    display_name: str = Field(..., min_length=1, max_length=128)
    password: str = Field(..., min_length=8, max_length=128)
    email: EmailStr | None = None
    is_admin: bool = False


class UserUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=128)
    email: EmailStr | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
    force_password_change: bool | None = None


class UserProfileUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=128)
    email: EmailStr | None = None


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    email: str | None = None
    avatar_path: str | None = None
    is_active: bool
    is_admin: bool
    force_password_change: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None
    mfa_enabled: bool = False

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int
    page: int
    page_size: int
