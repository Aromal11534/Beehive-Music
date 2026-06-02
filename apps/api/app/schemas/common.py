"""Common response schemas."""

from pydantic import BaseModel
from typing import Any, Generic, TypeVar

T = TypeVar("T")


class MessageResponse(BaseModel):
    message: str
    detail: str | None = None


class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
    total_pages: int
