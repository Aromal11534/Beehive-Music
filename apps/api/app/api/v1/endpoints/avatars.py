"""Avatar upload and serving endpoints."""

from io import BytesIO
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError
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
FORMAT_TO_CONTENT_TYPE = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "GIF": "image/gif",
}
MAX_DIMENSION = 4096
MAX_FRAMES = 100
MAX_TOTAL_PIXELS = 32_000_000


def _validate_dimensions(width: int, height: int, total_pixels: int) -> int:
    if width < 1 or height < 1 or width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ValidationError(
            f"Invalid image dimensions. Maximum: {MAX_DIMENSION}x{MAX_DIMENSION}"
        )
    total_pixels += width * height
    if total_pixels > MAX_TOTAL_PIXELS:
        raise ValidationError("Animated image is too large to process safely")
    return total_pixels


def _sanitize_avatar(data: bytes) -> tuple[bytes, str]:
    """Decode and re-encode image pixels, stripping attacker-controlled payloads."""
    try:
        with Image.open(BytesIO(data)) as source:
            image_format = (source.format or "").upper()
            content_type = FORMAT_TO_CONTENT_TYPE.get(image_format)
            if content_type is None:
                raise ValidationError("Unsupported image format")

            frames: list[Image.Image] = []
            durations: list[int] = []
            total_pixels = 0
            for index, raw_frame in enumerate(ImageSequence.Iterator(source)):
                if index >= MAX_FRAMES:
                    raise ValidationError(f"Animated images may contain at most {MAX_FRAMES} frames")
                # Check header dimensions before copying/loading compressed pixels.
                total_pixels = _validate_dimensions(
                    raw_frame.width,
                    raw_frame.height,
                    total_pixels,
                )
                frame = ImageOps.exif_transpose(raw_frame.copy())
                frame.load()
                if frame.width > MAX_DIMENSION or frame.height > MAX_DIMENSION:
                    raise ValidationError(
                        f"Invalid image dimensions. Maximum: {MAX_DIMENSION}x{MAX_DIMENSION}"
                    )
                frames.append(frame.convert("RGBA"))
                durations.append(int(raw_frame.info.get("duration", source.info.get("duration", 100))))

            if not frames:
                raise ValidationError("Image contains no frames")

            output = BytesIO()
            if image_format == "GIF":
                gif_frames = [frame.convert("P", palette=Image.Palette.ADAPTIVE) for frame in frames]
                gif_frames[0].save(
                    output,
                    format="GIF",
                    save_all=True,
                    append_images=gif_frames[1:],
                    duration=durations,
                    loop=int(source.info.get("loop", 0)),
                    disposal=2,
                    optimize=True,
                )
            elif image_format == "WEBP" and len(frames) > 1:
                frames[0].save(
                    output,
                    format="WEBP",
                    save_all=True,
                    append_images=frames[1:],
                    duration=durations,
                    loop=int(source.info.get("loop", 0)),
                    quality=90,
                    method=4,
                )
            elif image_format == "JPEG":
                frames[0].convert("RGB").save(
                    output,
                    format="JPEG",
                    quality=90,
                    optimize=True,
                )
            elif image_format == "PNG":
                frames[0].save(output, format="PNG", optimize=True)
            else:
                frames[0].save(output, format="WEBP", quality=90, method=4)

            return output.getvalue(), content_type
    except ValidationError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as exc:
        raise ValidationError("Uploaded file is not a valid image") from exc


@router.post("/upload", response_model=MessageResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a profile avatar."""
    settings = get_settings()

    # The MIME header is only an initial allowlist. Pixel decoding below is the
    # authoritative validation step.
    if file.content_type not in ALLOWED_TYPES:
        raise ValidationError(f"Invalid file type. Allowed: {', '.join(ALLOWED_TYPES)}")

    # Read and validate size
    data = await file.read()
    max_bytes = settings.avatar_max_size_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise ValidationError(f"File too large. Max: {settings.avatar_max_size_mb}MB")
    if not data:
        raise ValidationError("Uploaded file is empty")

    sanitized_data, content_type = await run_in_threadpool(_sanitize_avatar, data)
    if len(sanitized_data) > max_bytes:
        raise ValidationError(f"Processed image is too large. Max: {settings.avatar_max_size_mb}MB")

    storage = get_storage()

    # Delete old avatar if exists
    if current_user.avatar_path:
        await storage.delete(current_user.avatar_path)

    # Save new avatar
    path = await storage.save("avatar", sanitized_data, content_type)

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
    if Path(filename).name != filename:
        raise ValidationError("Invalid avatar filename")

    base_path = Path(settings.avatar_storage_path).resolve()
    file_path = (base_path / filename).resolve()
    if file_path.parent != base_path or not file_path.is_file():
        raise ValidationError("Avatar not found")

    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    media_type = media_types.get(file_path.suffix.lower())
    if media_type is None:
        raise ValidationError("Invalid avatar format")
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )
