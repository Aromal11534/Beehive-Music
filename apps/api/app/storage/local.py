"""Local filesystem storage backend."""

import uuid
import aiofiles
from pathlib import Path

from app.storage.base import StorageBackend
from app.core.config import get_settings


class LocalStorageBackend(StorageBackend):
    def __init__(self, base_path: str | None = None):
        settings = get_settings()
        self.base_path = Path(base_path or settings.avatar_storage_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def save(self, filename: str, data: bytes, content_type: str) -> str:
        # The caller-provided filename is untrusted. Derive the served extension
        # only from the validated content type so HTML cannot be stored under an
        # executable same-origin extension.
        ext = self._ext_from_content_type(content_type)
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = self.base_path / unique_name

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(data)

        return str(file_path)

    async def delete(self, path: str) -> bool:
        file_path = Path(path)
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    async def get_url(self, path: str) -> str:
        return f"/api/v1/avatars/{Path(path).name}"

    async def exists(self, path: str) -> bool:
        return Path(path).exists()

    @staticmethod
    def _ext_from_content_type(content_type: str) -> str:
        mapping = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }
        return mapping.get(content_type, ".jpg")
