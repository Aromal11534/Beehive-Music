from collections import deque
from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints import guilds as guild_endpoints
from app.api.v1.endpoints import history as history_endpoints
from app.api.v1.deps import require_guild_access_by_id
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models.guild import DiscordGuild, UserGuildAccess
from app.models.user import User
from app.schemas.guild import ServerSettingsUpdate


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _FakeSession:
    def __init__(self, *results):
        self.results = deque(results)
        self.execute_count = 0

    async def execute(self, _statement):
        self.execute_count += 1
        return _ScalarResult(self.results.popleft())


def _user(*, is_admin: bool = False) -> User:
    return User(id=7, username="member", display_name="Member", password_hash="x", is_admin=is_admin)


def _guild() -> DiscordGuild:
    return DiscordGuild(id=11, discord_guild_id="123456789", name="Test Guild")


@pytest.mark.asyncio
async def test_missing_guild_is_not_found():
    db = _FakeSession(None)

    with pytest.raises(NotFoundError) as exc_info:
        await require_guild_access_by_id(11, _user(), db)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_outsider_cannot_read_guild():
    db = _FakeSession(_guild(), None)

    with pytest.raises(AuthorizationError) as exc_info:
        await require_guild_access_by_id(11, _user(), db)

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["viewer", "dj", "moderator", "admin"])
async def test_every_guild_role_can_read(role: str):
    guild = _guild()
    access = UserGuildAccess(user_id=7, guild_id=guild.id, role=role)
    db = _FakeSession(guild, access)

    authorized_guild = await require_guild_access_by_id(guild.id, _user(), db)

    assert authorized_guild is guild


@pytest.mark.asyncio
async def test_non_admin_member_cannot_change_admin_settings():
    guild = _guild()
    access = UserGuildAccess(user_id=7, guild_id=guild.id, role="moderator")
    db = _FakeSession(guild, access)

    with pytest.raises(AuthorizationError) as exc_info:
        await require_guild_access_by_id(
            guild.id,
            _user(),
            db,
            allowed_roles={"admin"},
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_guild_admin_can_change_admin_settings():
    guild = _guild()
    access = UserGuildAccess(user_id=7, guild_id=guild.id, role="admin")
    db = _FakeSession(guild, access)

    authorized_guild = await require_guild_access_by_id(
        guild.id,
        _user(),
        db,
        allowed_roles={"admin"},
    )

    assert authorized_guild is guild


@pytest.mark.asyncio
async def test_global_admin_bypasses_membership_and_role_checks():
    guild = _guild()
    db = _FakeSession(guild)

    authorized_guild = await require_guild_access_by_id(
        guild.id,
        _user(is_admin=True),
        db,
        allowed_roles={"admin"},
    )

    assert authorized_guild is guild
    assert db.execute_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", [False, True], ids=["outsider", "missing-guild"])
@pytest.mark.parametrize(
    ("module", "endpoint", "extra_kwargs"),
    [
        (guild_endpoints, guild_endpoints.get_guild, {}),
        (guild_endpoints, guild_endpoints.get_settings, {}),
        (
            guild_endpoints,
            guild_endpoints.update_settings,
            {"data": ServerSettingsUpdate(default_volume=75)},
        ),
        (
            history_endpoints,
            history_endpoints.get_guild_history,
            {"limit": 1, "offset": 0},
        ),
    ],
)
async def test_affected_routes_enforce_the_shared_guard(
    monkeypatch,
    missing,
    module,
    endpoint,
    extra_kwargs,
):
    error = NotFoundError("Guild not found") if missing else AuthorizationError("No access")
    guard = AsyncMock(side_effect=error)
    monkeypatch.setattr(module, "require_guild_access_by_id", guard)

    if module is guild_endpoints:
        monkeypatch.setattr(
            guild_endpoints,
            "GuildService",
            lambda _db: pytest.fail("service ran before authorization"),
        )
    else:
        monkeypatch.setattr(
            history_endpoints,
            "HistoryService",
            lambda _db: pytest.fail("service ran before authorization"),
        )

    with pytest.raises(type(error)) as exc_info:
        await endpoint(
            guild_id=11,
            current_user=_user(),
            db=object(),
            **extra_kwargs,
        )

    assert exc_info.value.status_code == (404 if missing else 403)
    guard.assert_awaited_once()


@pytest.mark.asyncio
async def test_member_read_routes_continue_to_return_data(monkeypatch):
    guild = _guild()
    settings = object()
    history = [object()]
    guild_guard = AsyncMock(return_value=guild)
    history_guard = AsyncMock(return_value=guild)
    get_settings = AsyncMock(return_value=settings)
    get_history = AsyncMock(return_value=history)

    monkeypatch.setattr(guild_endpoints, "require_guild_access_by_id", guild_guard)
    monkeypatch.setattr(history_endpoints, "require_guild_access_by_id", history_guard)
    monkeypatch.setattr(
        guild_endpoints,
        "GuildService",
        lambda _db: type("GuildServiceStub", (), {"get_settings": get_settings})(),
    )
    monkeypatch.setattr(
        history_endpoints,
        "HistoryService",
        lambda _db: type("HistoryServiceStub", (), {"get_guild_history": get_history})(),
    )

    user = _user()
    db = object()
    assert await guild_endpoints.get_guild(11, user, db) is guild
    assert await guild_endpoints.get_settings(11, user, db) is settings
    assert await history_endpoints.get_guild_history(11, 1, 0, user, db) is history
    assert guild_guard.await_count == 2
    history_guard.assert_awaited_once_with(11, user, db)


@pytest.mark.asyncio
async def test_settings_route_requires_admin_role_before_update(monkeypatch):
    guard = AsyncMock(side_effect=AuthorizationError("Admin access required"))
    monkeypatch.setattr(guild_endpoints, "require_guild_access_by_id", guard)
    monkeypatch.setattr(
        guild_endpoints,
        "GuildService",
        lambda _db: pytest.fail("settings changed before authorization"),
    )

    user = _user()
    db = object()
    with pytest.raises(AuthorizationError):
        await guild_endpoints.update_settings(
            11,
            ServerSettingsUpdate(default_volume=75),
            user,
            db,
        )

    guard.assert_awaited_once_with(11, user, db, allowed_roles={"admin"})


@pytest.mark.asyncio
async def test_guild_admin_and_global_admin_reach_settings_update(monkeypatch):
    updated = object()

    for user in (_user(), _user(is_admin=True)):
        guard = AsyncMock(return_value=_guild())
        update = AsyncMock(return_value=updated)
        monkeypatch.setattr(guild_endpoints, "require_guild_access_by_id", guard)
        monkeypatch.setattr(
            guild_endpoints,
            "GuildService",
            lambda _db, update=update: type(
                "GuildServiceStub",
                (),
                {"update_settings": update},
            )(),
        )

        db = object()
        result = await guild_endpoints.update_settings(
            11,
            ServerSettingsUpdate(default_volume=75),
            user,
            db,
        )

        assert result is updated
        guard.assert_awaited_once_with(11, user, db, allowed_roles={"admin"})
        update.assert_awaited_once_with(11, default_volume=75)
