"""Avatar upload and serving endpoints."""

from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ValidationError
from app.core.config import get_settings
from app.api.v1.deps import get_current_user
from app.schemas.common import MessageResponse
from app.services.user_service import UserService
from app.storage import get_storage
from app.models.user import User

router = APIRouter(prefix="/avatars", tags=["Avatars"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/upload", response_model=MessageResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a profile avatar."""
    settings = get_settings()

    # Validate content type
    if file.content_type not in ALLOWED_TYPES:
        raise ValidationError(f"Invalid file type. Allowed: {', '.join(ALLOWED_TYPES)}")

    # Read and validate size
    data = await file.read()
    max_bytes = settings.avatar_max_size_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise ValidationError(f"File too large. Max: {settings.avatar_max_size_mb}MB")

    storage = get_storage()

    # Delete old avatar if exists
    if current_user.avatar_path:
        await storage.delete(current_user.avatar_path)

    # Save new avatar
    path = await storage.save(file.filename or "avatar.jpg", data, file.content_type)

    # Update user
    service = UserService(db)
    await service.update_avatar(current_user.id, path)

    return {"message": "Avatar uploaded successfully"}


@router.delete("/remove", response_model=MessageResponse)
async def remove_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the current user's avatar."""
    if current_user.avatar_path:
        storage = get_storage()
        await storage.delete(current_user.avatar_path)

    service = UserService(db)
    await service.remove_avatar(current_user.id)
    return {"message": "Avatar removed"}


@router.get("/{filename}")
async def serve_avatar(filename: str):
    """Serve an avatar file."""
    settings = get_settings()
    file_path = Path(settings.avatar_storage_path) / filename
    if not file_path.exists():
        raise ValidationError("Avatar not found")
    return FileResponse(file_path)
