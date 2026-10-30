"""Best-effort push delivery for one user: Web Push (VAPID) + Expo relay (FCM).

Everything here is deliberately non-fatal. A slow or broken push endpoint must
never block or fail the request that triggered the notification, so delivery is
snapshotted on the calling thread and dispatched to a short-lived daemon
thread that only does network I/O (plus prune deletes on expired subscriptions).
"""
import json
import logging
import threading

import requests
from django.conf import settings
from django.db import connection, transaction
from pywebpush import WebPushException, webpush

from .models import ExpoPushToken, WebPushSubscription

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_CHUNK_SIZE = 100
HTTP_TIMEOUT_SECONDS = 5
MAX_CONCURRENT_DELIVERY_THREADS = 8

_thread_slots = threading.Semaphore(MAX_CONCURRENT_DELIVERY_THREADS)


def _spawn(worker):
    def guarded():
        acquired = _thread_slots.acquire(blocking=False)
        if not acquired:
            logger.warning("push: delivery thread cap reached, dropping batch")
            return
        try:
            worker()
        finally:
            _thread_slots.release()
            connection.close()

    threading.Thread(target=guarded, daemon=True, name="push-delivery").start()


def _payload(title, body, href):
    return {"title": title, "body": (body or "")[:200], "href": href}


def push_to_user(user, title, body, href="/"):
    """Queue a push for ``user`` on every registered device. Never raises."""
    if user is None or not getattr(settings, "PUSH_ENABLED", False):
        return
    try:
        web_rows = list(
            WebPushSubscription.objects.filter(user=user).values(
                "id", "endpoint", "p256dh", "auth"
            )
        )
        expo_rows = list(
            ExpoPushToken.objects.filter(user=user).values("id", "token", "platform")
        )
    except Exception:  # pragma: no cover - defensive: DB unavailable
        logger.exception("push: could not snapshot subscriptions")
        return
    if not web_rows and not expo_rows:
        return

    def deliver():
        try:
            for row in web_rows:
                _deliver_web(row, title, body, href)
            if expo_rows:
                _deliver_expo(expo_rows, title, body, href)
        except Exception:  # pragma: no cover - defensive; never let delivery crash
            logger.exception("push: delivery batch failed")

    try:
        # _spawn resolved at commit time, not bind time (tests patch it).
        transaction.on_commit(lambda: _spawn(deliver))
    except Exception:  # pragma: no cover - defensive
        logger.exception("push: scheduling delivery failed")


def _deliver_web(subscription, title, body, href):
    payload = json.dumps(_payload(title, body, href))
    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {
                    "p256dh": subscription["p256dh"],
                    "auth": subscription["auth"],
                },
            },
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={
                "sub": settings.VAPID_CLAIMS_EMAIL,
                "aud": _origin(subscription["endpoint"]),
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            WebPushSubscription.objects.filter(id=subscription["id"]).delete()
        else:
            logger.warning("push: web delivery failed (%s): %s", status, exc)
    except Exception:
        logger.exception("push: web delivery errored")


def _origin(endpoint):
    try:
        from urllib.parse import urlsplit

        parts = urlsplit(endpoint)
        return f"{parts.scheme}://{parts.netloc}"
    except Exception:
        return ""


def _deliver_expo(tokens, title, body, href):
    access_token = settings.EXPO_PUSH_ACCESS_TOKEN
    if not access_token:
        logger.warning("push: EXPO_PUSH_ACCESS_TOKEN unset, skipping %d Expo token(s)", len(tokens))
        return
    for start in range(0, len(tokens), EXPO_CHUNK_SIZE):
        chunk = tokens[start : start + EXPO_CHUNK_SIZE]
        notifications = [
            {
                "to": row["token"],
                "title": title,
                "body": (body or "")[:200],
                "data": {"href": href},
                "sound": "default",
                # Android needs an explicit channel to get heads-up display.
                "channelId": "default",
                "priority": "high",
            }
            for row in chunk
        ]
        try:
            response = requests.post(
                EXPO_PUSH_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={"messages": notifications},
                timeout=HTTP_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            results = response.json().get("data", [])
            for result in results:
                if isinstance(result, dict) and result.get("status") == "error":
                    logger.warning("push: expo ticket error: %s", result)
        except requests.HTTPError as exc:
            logger.error(
                "push: expo relay rejected the batch: %s",
                (getattr(exc.response, "text", "") or "")[:500],
            )
            continue
        except Exception:
            logger.exception("push: expo relay request failed")
            continue
        dead = [
            row["id"]
            for row, result in zip(chunk, results)
            if isinstance(result, dict)
            and result.get("status") == "error"
            and (result.get("details") or {}).get("error")
            in ("DeviceNotRegistered", "InvalidSdkVersion")
        ]
        if dead:
            ExpoPushToken.objects.filter(id__in=dead).delete()
