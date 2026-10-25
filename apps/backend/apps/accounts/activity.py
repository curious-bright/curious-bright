"""Privacy-safe daily activity tracking for DAU/WAU/MAU."""

from __future__ import annotations

import logging

from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)


def record_user_activity(user) -> None:
    """Record at most one activity row per user per local day.

    The cache key is a best-effort write throttle. If the cache is unavailable
    we still try the database once per request; the unique constraint makes the
    operation idempotent.
    """
    if not getattr(user, "is_authenticated", False):
        return
    today = timezone.localdate()
    cache_key = f"cb:activity:{user.pk}:{today.isoformat()}"
    try:
        first_today = cache.add(cache_key, 1, timeout=60 * 60 * 24)
    except Exception:  # cache outages must never break authentication
        first_today = True
    if not first_today:
        return

    from .models import UserActivity

    try:
        UserActivity.objects.get_or_create(
            user=user,
            date=today,
            defaults={
                "first_seen_at": timezone.now(),
                "last_seen_at": timezone.now(),
            },
        )
    except Exception:  # analytics must never block a request
        logger.exception("Could not record activity for user_id=%s", user.pk)
