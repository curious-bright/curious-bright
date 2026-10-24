"""Branded account emails rendered from Django templates."""
from __future__ import annotations

import logging
from urllib.parse import quote

from django.conf import settings
from django.template.loader import render_to_string

from apps.core.emails import EmailDispatchResult, dispatch_email

logger = logging.getLogger(__name__)


def first_name_for(user) -> str:
    return (user.first_name or "").strip() or user.username


def _context(user, **extra):
    app_url = (
        getattr(settings, "APP_FRONTEND_URL", "") or "https://app.curiousbright.com.ng"
    ).rstrip("/")
    context = {
        "first_name": first_name_for(user),
        "support_email": getattr(settings, "SUPPORT_EMAIL", "support@curiousbright.com.ng"),
        "logo_url": f"{app_url}/icon-192.png",
    }
    context.update(extra)
    return context


def _render(template_stem: str, context: dict) -> tuple[str, str] | None:
    try:
        text = render_to_string(f"emails/{template_stem}.txt", context)
        html = render_to_string(f"emails/{template_stem}.html", context)
    except Exception as exc:
        # A template bug must never delete an account or turn a successful
        # password reset into a 500. Log only the template name and exception
        # class: the context contains codes/tokens and must never reach logs.
        logger.warning(
            "Email template render failed kind=%s error=%s",
            template_stem,
            type(exc).__name__,
        )
        return None
    return text, html


def send_verification_email(
    user,
    code: str,
    *,
    frontend_origin: str,
    wait: bool = False,
) -> EmailDispatchResult:
    subject = "Your CuriousBright verification code"
    verify_url = f"{frontend_origin.rstrip('/')}/verify-email?email={quote(user.email)}"
    rendered = _render(
        "verification", _context(user, code=code, verify_url=verify_url)
    )
    if rendered is None:
        return EmailDispatchResult(queued=False, sent=False)
    text, html = rendered
    return dispatch_email(
        subject=subject,
        to=user.email,
        text=text,
        html=html,
        kind="email_verification",
        user_id=user.pk,
        wait=wait,
    )


def send_password_reset_email(user, reset_url: str) -> EmailDispatchResult:
    subject = "Reset your CuriousBright password"
    rendered = _render("password_reset", _context(user, reset_url=reset_url))
    if rendered is None:
        return EmailDispatchResult(queued=False, sent=False)
    text, html = rendered
    return dispatch_email(
        subject=subject,
        to=user.email,
        text=text,
        html=html,
        kind="password_reset",
        user_id=user.pk,
    )


def send_password_changed_email(user, *, frontend_origin: str) -> EmailDispatchResult:
    subject = "Your password was changed"
    forgot_url = f"{frontend_origin.rstrip('/')}/forgot-password"
    rendered = _render(
        "password_changed", _context(user, forgot_url=forgot_url)
    )
    if rendered is None:
        return EmailDispatchResult(queued=False, sent=False)
    text, html = rendered
    return dispatch_email(
        subject=subject,
        to=user.email,
        text=text,
        html=html,
        kind="password_changed",
        user_id=user.pk,
    )
