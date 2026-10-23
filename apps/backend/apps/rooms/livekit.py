"""LiveKit configuration helpers.

The deployment contract is deliberately simple: ``LIVEKIT_URL``,
``LIVEKIT_API_KEY`` and ``LIVEKIT_API_SECRET`` are the only values required.
Both LiveKit Cloud's ``wss://...`` URL and an ``https://...`` URL copied from a
dashboard are accepted, then normalised to a WebSocket URL for the browser.
"""
from django.conf import settings


def normalize_url(value):
    value = (value or "").strip().rstrip("/")
    if not value:
        return ""
    if value.startswith("https://"):
        return f"wss://{value[len('https://'):]}"
    if value.startswith("http://"):
        return f"ws://{value[len('http://'):]}"
    return value


def livekit_config():
    raw_url = getattr(settings, "LIVEKIT_URL", "")
    api_key = (getattr(settings, "LIVEKIT_API_KEY", "") or "").strip()
    api_secret = (getattr(settings, "LIVEKIT_API_SECRET", "") or "").strip()
    url = normalize_url(raw_url)
    missing = []
    if not raw_url:
        missing.append("LIVEKIT_URL")
    elif not url.startswith(("wss://", "ws://")):
        missing.append("LIVEKIT_URL (must begin with wss://, ws://, https:// or http://)")
    if not api_key:
        missing.append("LIVEKIT_API_KEY")
    if not api_secret:
        missing.append("LIVEKIT_API_SECRET")
    return {
        "configured": not missing,
        "url": url if not missing else "",
        "missing": missing,
    }
