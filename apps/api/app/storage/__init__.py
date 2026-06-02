"""Storage module — use get_storage() to obtain the configured backend."""

from app.storage.base import StorageBackend
from app.storage.local import LocalStorageBackend

_storage_instance: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = LocalStorageBackend()
    return _storage_instance
