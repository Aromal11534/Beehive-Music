from io import BytesIO
from uuid import uuid4

import jwt
import pytest
from PIL import Image
from pydantic import ValidationError as PydanticValidationError

from app.api.v1.endpoints.avatars import _sanitize_avatar
from app.api.v1.endpoints.player import TrackData, _valid_request_id, _validated_web_command
from app.core import security
from app.core.config import Settings
from app.core.exceptions import ValidationError
from app.schemas.guild import ServerSettingsUpdate
from app.schemas.player import normalize_bot_message


def test_refresh_token_cannot_be_used_as_access_token(monkeypatch):
    shared_key = "shared-test-secret-that-is-long-enough-123456"
    monkeypatch.setattr(security.settings, "jwt_secret_key", shared_key)
    monkeypatch.setattr(security.settings, "jwt_refresh_secret_key", shared_key)

    refresh_token = security.create_refresh_token({"sub": "7"})

    with pytest.raises(jwt.InvalidTokenError):
        security.decode_access_token(refresh_token)


def test_access_token_cannot_be_used_as_refresh_token(monkeypatch):
    shared_key = "shared-test-secret-that-is-long-enough-123456"
    monkeypatch.setattr(security.settings, "jwt_secret_key", shared_key)
    monkeypatch.setattr(security.settings, "jwt_refresh_secret_key", shared_key)

    access_token = security.create_access_token({"sub": "7"})

    with pytest.raises(jwt.InvalidTokenError):
        security.decode_refresh_token(access_token)


def test_production_rejects_reused_secrets():
    shared = "a" * 40

    with pytest.raises(PydanticValidationError, match="must be different"):
        Settings(
            _env_file=None,
            FASTAPI_ENV="production",
            JWT_SECRET_KEY=shared,
            JWT_REFRESH_SECRET_KEY=shared,
            INTERNAL_API_TOKEN="b" * 40,
        )


def test_internal_token_file_takes_precedence(tmp_path):
    token_file = tmp_path / "internal-token"
    file_token = "f" * 40
    token_file.write_text(file_token, encoding="utf-8")

    settings = Settings(
        _env_file=None,
        INTERNAL_API_TOKEN="stale-environment-token",
        INTERNAL_API_TOKEN_FILE=str(token_file),
    )

    assert settings.internal_api_token == file_token


def test_player_command_requires_uuid_and_rejects_leave():
    request_id = str(uuid4())

    assert _validated_web_command({
        "action": "move",
        "from": 0,
        "to": 1,
        "request_id": request_id,
    }) == {
        "action": "move",
        "from": 0,
        "to": 1,
        "request_id": request_id,
    }

    with pytest.raises(ValueError, match="request_id"):
        _validated_web_command({"action": "pause"})
    with pytest.raises(ValueError, match="Unsupported"):
        _validated_web_command({"action": "leave", "request_id": request_id})
    with pytest.raises(ValueError, match="between 0 and 200"):
        _validated_web_command({"action": "volume", "value": 201, "request_id": request_id})

    assert _valid_request_id({"request_id": request_id}) == request_id
    assert _valid_request_id({"request_id": "not-a-uuid"}) is None


def test_web_track_requires_a_fresh_resolvable_reference():
    with pytest.raises(PydanticValidationError, match="URL or identifier"):
        TrackData(title="Opaque track", encoded="untrusted-encoded-payload")

    track = TrackData(title="Searchable track", identifier="ytmsearch:searchable track")
    assert track.identifier == "ytmsearch:searchable track"


def test_command_result_survives_api_websocket_normalization():
    request_id = str(uuid4())

    assert normalize_bot_message({
        "type": "command_result",
        "request_id": request_id,
        "ok": False,
        "error": "No active player.",
    }) == {
        "type": "command_result",
        "request_id": request_id,
        "ok": False,
        "error": "No active player.",
    }


def test_avatar_is_reencoded_and_trailing_payload_is_removed():
    source = BytesIO()
    Image.new("RGB", (2, 2), color=(240, 180, 0)).save(source, format="PNG")
    marker = b"<script>alert('x')</script>"

    sanitized, content_type = _sanitize_avatar(source.getvalue() + marker)

    assert content_type == "image/png"
    assert marker not in sanitized
    with Image.open(BytesIO(sanitized)) as image:
        assert image.format == "PNG"
        assert image.size == (2, 2)


def test_avatar_dimensions_are_rejected_before_pixel_processing():
    source = BytesIO()
    Image.new("RGB", (4097, 1), color=(0, 0, 0)).save(source, format="PNG")

    with pytest.raises(ValidationError, match="Maximum"):
        _sanitize_avatar(source.getvalue())


def test_server_queue_limit_matches_bot_capacity():
    assert ServerSettingsUpdate(max_queue_size=500).max_queue_size == 500
    with pytest.raises(PydanticValidationError):
        ServerSettingsUpdate(max_queue_size=501)
