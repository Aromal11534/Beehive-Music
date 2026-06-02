"""Pydantic schemas for request/response validation."""

from .auth import (
    LoginRequest, LoginResponse, TokenRefreshRequest, TokenRefreshResponse,
    MfaVerifyRequest, PasswordChangeRequest
)
from .user import (
    UserCreate, UserUpdate, UserResponse, UserListResponse, UserProfileUpdate
)
from .mfa import (
    MfaSetupResponse, MfaEnableRequest, MfaDisableRequest, MfaStatusResponse
)
from .guild import (
    GuildCreate, GuildUpdate, GuildResponse, GuildAccessCreate, GuildAccessResponse,
    ServerSettingsUpdate, ServerSettingsResponse
)
from .playlist import (
    PlaylistCreate, PlaylistUpdate, PlaylistResponse, PlaylistTrackAdd,
    PlaylistTrackResponse, PlaylistDetailResponse
)
from .favorite import FavoriteCreate, FavoriteResponse
from .history import PlayHistoryCreate, PlayHistoryResponse
from .player import PlayerStateResponse, QueueTrackResponse
from .common import PaginatedResponse, MessageResponse
