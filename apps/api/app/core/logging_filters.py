"""Logging filters that prevent credentials from being written to logs."""

import logging
import re
from typing import Any


_SENSITIVE_QUERY_VALUE = re.compile(
    r"([?&](?:token|access_token|refresh_token|mfa_token|code)=)[^&\s\"']+",
    re.IGNORECASE,
)


def _redact_log_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value

    # Uvicorn passes the WebSocket path as a standalone log argument. Remove
    # the entire query string so encoded parameter names cannot bypass redaction.
    if value.startswith("/") and "?" in value:
        return f"{value.split('?', 1)[0]}?[REDACTED]"

    return _SENSITIVE_QUERY_VALUE.sub(r"\1[REDACTED]", value)


class SensitiveQueryFilter(logging.Filter):
    """Redact credentials from formatted logger messages and arguments."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = _redact_log_value(record.msg)

        if isinstance(record.args, tuple):
            record.args = tuple(_redact_log_value(value) for value in record.args)
        elif isinstance(record.args, dict):
            record.args = {
                key: _redact_log_value(value)
                for key, value in record.args.items()
            }

        return True
