"""Short-lived, single-use credentials for WebSocket connections.

WebSocket handshakes cannot carry an ``Authorization`` header from a browser,
so clients used to put their access token in the query string. Query strings
are copied verbatim into proxy and access logs, which turns every log reader
into a potential token thief. Instead, an authenticated HTTP request trades
the access token for a ticket that expires within a minute and can be used
once. The ticket is still visible in the URL, but replaying it is useless.
"""
from __future__ import annotations

import hashlib
import secrets

from django.conf import settings
from django.core.cache import caches

_used_marker = ":used"


def _cache():
    return caches["ws_tickets"]


def _key(ticket: str) -> str:
    digest = hashlib.sha256(ticket.encode("utf-8")).hexdigest()
    return f"ticket:{digest}"


def issue_ws_ticket(user_id: int) -> str:
    """Return a new ticket for ``user_id``. The raw value is never stored."""
    ticket = secrets.token_urlsafe(32)
    ttl = max(1, int(getattr(settings, "WS_TICKET_TTL_SECONDS", 60)))
    _cache().set(_key(ticket), user_id, timeout=ttl)
    return ticket


def consume_ws_ticket(ticket: str | None) -> int | None:
    """Validate and burn ``ticket``, returning the user id or ``None``.

    ``cache.add`` is atomic on both Redis and the in-process cache, so two
    simultaneous handshakes cannot both redeem the same ticket.
    """
    if not ticket or len(ticket) > 128:
        return None

    cache = _cache()
    key = _key(ticket)
    user_id = cache.get(key)
    if user_id is None:
        return None
    if not cache.add(key + _used_marker, "1", timeout=60):
        return None
    cache.delete(key)
    return user_id
