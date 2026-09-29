import logging

from app.core.logging_filters import SensitiveQueryFilter


def _record(message, args):
    return logging.LogRecord(
        name="uvicorn.error",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=args,
        exc_info=None,
    )


def test_websocket_query_is_removed_from_uvicorn_log_arguments():
    record = _record(
        '%s - "WebSocket %s" [accepted]',
        (("127.0.0.1", 1234), "/api/v1/player/ws/123?token=secret-jwt&x=1"),
    )

    SensitiveQueryFilter().filter(record)
    message = record.getMessage()

    assert "secret-jwt" not in message
    assert "x=1" not in message
    assert "/api/v1/player/ws/123?[REDACTED]" in message


def test_sensitive_values_in_embedded_urls_are_redacted():
    record = _record(
        "Callback failed for https://example.test/callback?code=oauth-secret&state=ok",
        (),
    )

    SensitiveQueryFilter().filter(record)
    message = record.getMessage()

    assert "oauth-secret" not in message
    assert "code=[REDACTED]" in message
    assert "state=ok" in message
