"""Transactional email delivery.

Production uses Resend's HTTPS API. Local development and tests fall back to
Django's configured email backend (console or locmem) when
``EMAIL_PROVIDER`` is ``console``/``django``.

Security notes:
- This module never logs message bodies, verification codes, reset tokens, or
  the Resend API key. Logs contain only the email kind and optional user id.
- Resend requests are sent over HTTPS with the key in the Authorization header.
  The key is read from settings/env only.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from email.utils import formataddr

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

# A small shared pool keeps request handlers free while avoiding a new thread
# per message. Threads are reaped by the interpreter at shutdown.
_email_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="cb-email")

RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


class EmailDeliveryError(Exception):
    """Raised internally when a provider rejects or cannot receive a message."""


@dataclass(frozen=True)
class EmailDispatchResult:
    """Whether a message was queued, and its result when known synchronously."""

    queued: bool
    sent: bool | None


def from_address() -> str:
    """Return the RFC 5322 From header with the CuriousBright display name."""
    configured = (getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()
    if not configured:
        configured = "noreply@curiousbright.com.ng"
    if "<" in configured and ">" in configured:
        return configured
    name = (getattr(settings, "EMAIL_FROM_NAME", "") or "CuriousBright").strip()
    return formataddr((name, configured))


def _send_via_django(*, subject: str, to: str, text: str, html: str) -> None:
    message = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=from_address(),
        to=[to],
        reply_to=[settings.EMAIL_REPLY_TO] if getattr(settings, "EMAIL_REPLY_TO", "") else None,
    )
    message.attach_alternative(html, "text/html")
    sent = message.send(fail_silently=False)
    if sent < 1:
        raise EmailDeliveryError("The configured email backend did not send the message.")


def _send_via_resend(*, subject: str, to: str, text: str, html: str) -> None:
    api_key = (getattr(settings, "RESEND_API_KEY", "") or "").strip()
    if not api_key:
        raise EmailDeliveryError("RESEND_API_KEY is not configured.")

    payload = {
        "from": from_address(),
        "to": [to],
        "subject": subject,
        "text": text,
        "html": html,
    }
    reply_to = (getattr(settings, "EMAIL_REPLY_TO", "") or "").strip()
    if reply_to:
        payload["reply_to"] = reply_to

    url = getattr(settings, "RESEND_API_URL", "https://api.resend.com/emails")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "CuriousBright/1.0",
    }
    timeout = max(1, int(getattr(settings, "RESEND_TIMEOUT_SECONDS", 10)))
    attempts = max(1, int(getattr(settings, "RESEND_MAX_ATTEMPTS", 3)))
    base_delay = max(0, int(getattr(settings, "RESEND_RETRY_BASE_SECONDS", 1)))

    last_status: int | None = None
    last_error: str = ""

    for attempt in range(1, attempts + 1):
        try:
            response = requests.post(
                url, json=payload, headers=headers, timeout=timeout
            )
            last_status = response.status_code
            if 200 <= response.status_code < 300:
                return
            if response.status_code not in RETRYABLE_STATUS_CODES:
                break
            last_error = f"HTTP {response.status_code}"
        except requests.RequestException as exc:
            last_error = type(exc).__name__

        if attempt < attempts:
            # Never include the response body or request payload in logs. A
            # short exponential backoff gives Resend a chance to recover.
            time.sleep(base_delay * (2 ** (attempt - 1)))

    raise EmailDeliveryError(
        f"Resend delivery failed (status={last_status or 'network'}, error={last_error or 'unknown'})."
    )


def send_email(
    *,
    subject: str,
    to: str,
    text: str,
    html: str,
    kind: str,
    user_id: int | None = None,
) -> bool:
    """Send one transactional email, returning False instead of raising.

    The caller deliberately receives only a boolean so API flows never leak
    delivery internals. Detailed failures are logged without sensitive data.
    """
    provider = (getattr(settings, "EMAIL_PROVIDER", "console") or "console").lower()
    try:
        if provider == "resend":
            _send_via_resend(subject=subject, to=to, text=text, html=html)
        elif provider in {"console", "django"}:
            _send_via_django(subject=subject, to=to, text=text, html=html)
        else:
            raise EmailDeliveryError(f"Unsupported EMAIL_PROVIDER {provider!r}.")
    except Exception as exc:  # delivery must never break the surrounding flow
        logger.warning(
            "Transactional email failed kind=%s user_id=%s provider=%s error=%s",
            kind,
            user_id or "-",
            provider,
            type(exc).__name__,
        )
        return False

    logger.info(
        "Transactional email sent kind=%s user_id=%s provider=%s",
        kind,
        user_id or "-",
        provider,
    )
    return True


def dispatch_email(
    *,
    subject: str,
    to: str,
    text: str,
    html: str,
    kind: str,
    user_id: int | None = None,
    wait: bool = False,
) -> EmailDispatchResult:
    """Send now or in the background.

    ``wait=True`` is used by the resend-code endpoint: delivery runs in the
    background thread, but the endpoint waits briefly for the result so a
    Resend outage can produce an immediate, clear global alert. Registration
    and password-reset requests use the non-blocking default.
    """
    async_delivery = bool(getattr(settings, "EMAIL_DELIVERY_ASYNC", False))
    if not async_delivery:
        sent = send_email(
            subject=subject, to=to, text=text, html=html, kind=kind, user_id=user_id
        )
        return EmailDispatchResult(queued=False, sent=sent)

    future: Future[bool] = _email_executor.submit(
        send_email,
        subject=subject,
        to=to,
        text=text,
        html=html,
        kind=kind,
        user_id=user_id,
    )
    if not wait:
        return EmailDispatchResult(queued=True, sent=None)

    timeout = max(0, int(getattr(settings, "EMAIL_DELIVERY_WAIT_SECONDS", 8)))
    try:
        sent = future.result(timeout=timeout)
    except TimeoutError:
        # The worker continues retrying; the response simply cannot promise
        # success yet. The user still has an actionable resend button.
        return EmailDispatchResult(queued=True, sent=None)
    return EmailDispatchResult(queued=True, sent=sent)
