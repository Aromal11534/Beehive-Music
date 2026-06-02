"""Storage abstraction layer for file uploads (avatars, etc.)."""

from abc import ABC, abstractmethod
from pathlib import Path


class StorageBackend(ABC):
    """Abstract storage interface — implement for local, S3, R2, MinIO, etc."""

    @abstractmethod
    async def save(self, filename: str, data: bytes, content_type: str) -> str:
        """Save a file and return the storage path/key."""
        ...

    @abstractmethod
    async def delete(self, path: str) -> bool:
        """Delete a file by its path/key. Returns True if deleted."""
        ...

    @abstractmethod
    async def get_url(self, path: str) -> str:
        """Get a URL or path to serve the file."""
        ...

    @abstractmethod
    async def exists(self, path: str) -> bool:
        """Check if a file exists."""
        ...
