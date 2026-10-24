"""Access-log helpers that keep credentials out of server logs.

WebSocket credentials travel in the query string (there is no way for a
browser to set an Authorization header on the handshake), so every access log
line would otherwise contain a replayable value. Both the formatter used by
``config/logging.yaml`` and the runtime filter installed from ``asgi.py``
redact known credential parameters while leaving the rest of the URL intact.
"""
from __future__ import annotations

import copy
import logging
import re

from uvicorn.logging import AccessFormatter

_SENSITIVE_QUERY = re.compile(
    r"(?i)([?&](?:token|ticket|access_token|refresh_token)=)[^&\s\"']+"
)
_REDACTED = r"\1[redacted]"


def redact_sensitive_query(value: str) -> str:
    return _SENSITIVE_QUERY.sub(_REDACTED, value)


def _redact_value(value):
    return redact_sensitive_query(value) if isinstance(value, str) else value


def _redact_args(args):
    if isinstance(args, tuple):
        return tuple(_redact_value(arg) for arg in args)
    if isinstance(args, dict):
        return {key: _redact_value(value) for key, value in args.items()}
    return args


class RedactingAccessFormatter(AccessFormatter):
    """uvicorn's access formatter with credential query parameters masked."""

    def formatMessage(self, record: logging.LogRecord) -> str:
        if not record.args:
            return super().formatMessage(record)
        safe_record = copy.copy(record)
        safe_record.args = _redact_args(record.args)
        return super().formatMessage(safe_record)


class RedactSensitiveQueryFilter(logging.Filter):
    """Mask credentials in log records before any handler formats them."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = _redact_args(record.args)
        return True


def install_access_log_redaction() -> None:
    """Attach the filter to the access loggers in use (idempotent)."""
    for name in ("uvicorn.access", "django.server"):
        logger = logging.getLogger(name)
        if not any(isinstance(item, RedactSensitiveQueryFilter) for item in logger.filters):
            logger.addFilter(RedactSensitiveQueryFilter())
