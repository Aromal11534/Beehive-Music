"""Rate limiting configuration using slowapi."""

from slowapi import Limiter
from slowapi.util import get_remote_address


def _get_real_ip(request) -> str:
    """Extract real IP from X-Forwarded-For (behind Nginx) or fall back to direct IP."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# Global limiter instance — import this wherever rate limiting is needed
limiter = Limiter(key_func=_get_real_ip, default_limits=["200/minute"])
