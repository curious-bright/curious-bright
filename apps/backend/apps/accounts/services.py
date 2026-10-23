"""Email verification, email change, and password-reset flows."""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.exceptions import APIException
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.emails import EmailDispatchResult

from .emails import (
    send_password_changed_email,
    send_password_reset_email,
    send_verification_email,
)
from .models import EmailVerificationCode, PasswordResetToken, Profile

User = get_user_model()
logger = logging.getLogger(__name__)


class AuthFlowError(APIException):
    """An auth-flow failure with a stable API code and status."""

    status_code = 400

    def __init__(self, message, *, code="invalid_request", status_code=None):
        self.api_code = code
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail=message, code=code)


def request_ip(request) -> str:
    forwarded = (request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    return forwarded or (request.META.get("REMOTE_ADDR") or "").strip()


def hash_ip(ip: str) -> str:
    if not ip:
        return ""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{ip}".encode("utf-8")).hexdigest()


def request_ip_hash(request) -> str:
    return hash_ip(request_ip(request))


def _origin_from_referer(referer: str) -> str:
    parsed = urlparse((referer or "").strip())
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def frontend_origin_for_request(request) -> str:
    """Choose the requesting app's public URL without trusting arbitrary origins."""
    app_url = getattr(settings, "APP_FRONTEND_URL", "https://app.curiousbright.com.ng").rstrip("/")
    org_url = getattr(settings, "ORG_FRONTEND_URL", "https://org.curiousbright.com.ng").rstrip("/")
    allowed = {app_url, org_url}
    allowed.update(
        origin.rstrip("/")
        for origin in getattr(settings, "CORS_ALLOWED_ORIGINS", [])
        if origin
    )

    origin = (request.headers.get("Origin") or "").strip().rstrip("/")
    if not origin:
        origin = _origin_from_referer(request.headers.get("Referer") or "")
    if origin and origin in allowed:
        return origin

    if (request.headers.get("X-Client-App") or "").lower() == "institutional":
        return org_url
    return app_url


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _dispatch_safely(kind: str, user, sender):
    """Run a sender without letting an unexpected mail failure break auth."""
    try:
        return sender()
    except Exception as exc:
        # Never include the message context here: it may contain a code/token.
        logger.warning(
            "Transactional email dispatch failed kind=%s user_id=%s error=%s",
            kind,
            getattr(user, "pk", "-"),
            type(exc).__name__,
        )
        return EmailDispatchResult(queued=False, sent=False)


def _cooldown_error(seconds: int) -> AuthFlowError:
    return AuthFlowError(
        f"Please wait {max(1, seconds)} seconds before requesting another code.",
        code="resend_cooldown",
        status_code=429,
    )


def enforce_verification_send_limits(email: str, request) -> None:
    """Enforce the per-email and per-IP send limits before creating an account."""
    now = timezone.now()
    cooldown = int(getattr(settings, "EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS", 60))
    hourly_email = int(getattr(settings, "EMAIL_VERIFICATION_EMAIL_HOURLY_LIMIT", 5))
    hourly_ip = int(getattr(settings, "EMAIL_VERIFICATION_IP_HOURLY_LIMIT", 10))
    ip_hash = request_ip_hash(request)

    email_codes = EmailVerificationCode.objects.filter(email__iexact=email)
    latest = email_codes.order_by("-created_at").first()
    if latest:
        elapsed = (now - latest.created_at).total_seconds()
        if elapsed < cooldown:
            raise _cooldown_error(int(cooldown - elapsed) + 1)

    if email_codes.filter(created_at__gte=now - timedelta(hours=1)).count() >= hourly_email:
        raise AuthFlowError(
            "Too many verification codes have been requested for this email. Try again later.",
            code="email_rate_limited",
            status_code=429,
        )

    if ip_hash:
        recent_ip = EmailVerificationCode.objects.filter(
            request_ip_hash=ip_hash,
            created_at__gte=now - timedelta(hours=1),
        ).count()
        if recent_ip >= hourly_ip:
            raise AuthFlowError(
                "Too many verification codes have been requested from this network. Try again later.",
                code="ip_rate_limited",
                status_code=429,
            )


def issue_verification_code(
    user,
    request,
    *,
    enforce_limits: bool = True,
    wait: bool = False,
):
    if enforce_limits:
        enforce_verification_send_limits(user.email, request)

    now = timezone.now()
    ttl = int(getattr(settings, "EMAIL_VERIFICATION_CODE_TTL_SECONDS", 600))
    code = _generate_code()
    ip_hash = request_ip_hash(request)

    with transaction.atomic():
        EmailVerificationCode.objects.filter(
            user=user, consumed_at__isnull=True
        ).update(consumed_at=now)
        record = EmailVerificationCode.objects.create(
            user=user,
            email=user.email,
            code_hash=make_password(code),
            request_ip_hash=ip_hash,
            expires_at=now + timedelta(seconds=ttl),
        )

    dispatch = _dispatch_safely(
        "email_verification",
        user,
        lambda: send_verification_email(
            user,
            code,
            frontend_origin=frontend_origin_for_request(request),
            wait=wait,
        ),
    )
    return record, dispatch


def verify_email_code(email: str, code: str, request) -> User:
    now = timezone.now()
    max_attempts = int(getattr(settings, "EMAIL_VERIFICATION_MAX_ATTEMPTS", 5))
    error: AuthFlowError | None = None
    verified_user = None

    # Do not raise inside this atomic block after mutating attempts/consumed_at:
    # an exception would roll back the very increment we need to persist. Build
    # the error, commit the state change, then raise after the block exits.
    with transaction.atomic():
        user = (
            User.objects.select_for_update()
            .filter(email__iexact=(email or "").strip(), is_active=True)
            .first()
        )
        if user is None:
            error = AuthFlowError(
                "This code is invalid or has expired. Request a new code.",
                code="invalid_code",
            )
        elif user.is_email_verified:
            error = AuthFlowError(
                "This email is already verified. Please sign in.",
                code="already_verified",
            )
        else:
            record = (
                EmailVerificationCode.objects.select_for_update()
                .filter(user=user)
                .order_by("-created_at")
                .first()
            )
            if record is None:
                error = AuthFlowError(
                    "This code is invalid or has expired. Request a new code.",
                    code="invalid_code",
                )
            # Check the lock before the consumed flag so a code locked by
            # attempts reports the right recovery action.
            elif record.attempts >= max_attempts:
                error = AuthFlowError(
                    "Too many incorrect attempts. Request a new code.",
                    code="code_locked",
                )
            elif record.consumed_at is not None:
                error = AuthFlowError(
                    "This code has already been used. Request a new code.",
                    code="code_used",
                )
            elif record.expires_at <= now:
                record.consumed_at = now
                record.save(update_fields=["consumed_at"])
                error = AuthFlowError(
                    "This code has expired. Request a new code.",
                    code="code_expired",
                )
            elif not check_password(code, record.code_hash):
                record.attempts += 1
                if record.attempts >= max_attempts:
                    record.consumed_at = now
                record.save(update_fields=["attempts", "consumed_at"])
                if record.attempts >= max_attempts:
                    error = AuthFlowError(
                        "Too many incorrect attempts. Request a new code.",
                        code="code_locked",
                    )
                else:
                    remaining = max_attempts - record.attempts
                    error = AuthFlowError(
                        f"That code is incorrect. {remaining} "
                        f"{'attempt' if remaining == 1 else 'attempts'} remaining.",
                        code="invalid_code",
                    )
            else:
                record.consumed_at = now
                record.save(update_fields=["consumed_at"])
                EmailVerificationCode.objects.filter(
                    user=user, consumed_at__isnull=True
                ).update(consumed_at=now)

                user.is_email_verified = True
                user.save(update_fields=["is_email_verified"])
                Profile.objects.get_or_create(user=user)
                verified_user = user

    if error is not None:
        raise error
    return verified_user


def resend_verification_code(email: str, request):
    """Return (user, dispatch) for a pending account, or (None, None)."""
    user = User.objects.filter(
        email__iexact=(email or "").strip(), is_active=True
    ).first()
    if user is None or user.is_email_verified:
        return None, None
    _, dispatch = issue_verification_code(user, request, enforce_limits=True, wait=True)
    return user, dispatch


def change_pending_email(email: str, password: str, new_email: str, request):
    """Change an unverified account's email after re-checking its password."""
    user = User.objects.filter(
        email__iexact=(email or "").strip(), is_active=True
    ).first()
    if user is None or user.is_email_verified or not user.check_password(password or ""):
        raise AuthFlowError(
            "The current email or password is incorrect.",
            code="invalid_credentials",
        )

    new_email = (new_email or "").strip().lower()
    if new_email == user.email.lower():
        raise AuthFlowError(
            "Choose a different email address.", code="validation_error"
        )
    if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
        raise AuthFlowError("That email is already registered.", code="validation_error")

    # Check limits before changing the account so a throttled request is a no-op.
    enforce_verification_send_limits(new_email, request)
    old_email = user.email
    with transaction.atomic():
        user.email = new_email
        user.save(update_fields=["email"])
        EmailVerificationCode.objects.filter(
            user=user, consumed_at__isnull=True
        ).update(consumed_at=timezone.now())

    try:
        _, dispatch = issue_verification_code(
            user, request, enforce_limits=False, wait=True
        )
    except Exception:
        # The email is already changed; the user can retry with resend-code.
        user.email = old_email
        user.save(update_fields=["email"])
        raise
    return user, dispatch


def request_password_reset(email: str, request):
    """Create/send a reset link when appropriate; never reveal account status."""
    user = User.objects.filter(
        email__iexact=(email or "").strip(), is_active=True
    ).first()
    if user is None:
        return None, None

    now = timezone.now()
    cooldown = int(getattr(settings, "PASSWORD_RESET_COOLDOWN_SECONDS", 60))
    hourly_email = int(getattr(settings, "PASSWORD_RESET_EMAIL_HOURLY_LIMIT", 5))
    hourly_ip = int(getattr(settings, "PASSWORD_RESET_IP_HOURLY_LIMIT", 10))
    ip_hash = request_ip_hash(request)

    recent = PasswordResetToken.objects.filter(
        user=user, created_at__gte=now - timedelta(hours=1)
    )
    latest = recent.order_by("-created_at").first()
    if latest and (now - latest.created_at).total_seconds() < cooldown:
        return user, None
    if recent.count() >= hourly_email:
        return user, None
    if ip_hash:
        recent_ip = PasswordResetToken.objects.filter(
            request_ip_hash=ip_hash,
            created_at__gte=now - timedelta(hours=1),
        ).count()
        if recent_ip >= hourly_ip:
            return user, None

    ttl = int(getattr(settings, "PASSWORD_RESET_TOKEN_TTL_SECONDS", 1800))
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    with transaction.atomic():
        PasswordResetToken.objects.filter(user=user, used_at__isnull=True).update(
            used_at=now
        )
        PasswordResetToken.objects.create(
            user=user,
            token_hash=token_hash,
            request_ip_hash=ip_hash,
            expires_at=now + timedelta(seconds=ttl),
        )

    origin = frontend_origin_for_request(request)
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    reset_url = f"{origin}/reset-password?{urlencode({'uid': uid, 'token': raw_token})}"
    dispatch = _dispatch_safely(
        "password_reset",
        user,
        lambda: send_password_reset_email(user, reset_url),
    )
    return user, dispatch


def confirm_password_reset(uid: str, token: str, new_password: str, request):
    try:
        user_id = urlsafe_base64_decode(uid or "").decode("utf-8")
        user = User.objects.filter(pk=int(user_id), is_active=True).first()
    except (ValueError, TypeError, UnicodeDecodeError, OverflowError):
        user = None

    token_hash = hashlib.sha256((token or "").encode("utf-8")).hexdigest()
    if user is None:
        raise AuthFlowError(
            "This reset link is invalid or has expired.",
            code="invalid_reset_token",
        )

    now = timezone.now()
    with transaction.atomic():
        reset = (
            PasswordResetToken.objects.select_for_update()
            .filter(
                user=user,
                token_hash=token_hash,
                used_at__isnull=True,
            )
            .order_by("-created_at")
            .first()
        )
        if reset is None:
            raise AuthFlowError(
                "This reset link is invalid or has expired.",
                code="invalid_reset_token",
            )
        if reset.expires_at <= now:
            reset.used_at = now
            reset.save(update_fields=["used_at"])
            raise AuthFlowError(
                "This reset link has expired. Request a new one.",
                code="reset_token_expired",
            )

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            raise AuthFlowError(" ".join(exc.messages), code="validation_error")

        user.set_password(new_password)
        user.save(update_fields=["password"])
        Profile.objects.filter(user=user).update(must_change_password=False)

        reset.used_at = now
        reset.save(update_fields=["used_at"])
        PasswordResetToken.objects.filter(
            user=user, used_at__isnull=True
        ).update(used_at=now)

    notify_password_changed(user, request)
    return user


def notify_password_changed(user, request):
    """Best-effort password-changed notice; never break the password change."""
    return _dispatch_safely(
        "password_changed",
        user,
        lambda: send_password_changed_email(
            user, frontend_origin=frontend_origin_for_request(request)
        ),
    )


def tokens_for_user(user) -> dict[str, str]:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}
