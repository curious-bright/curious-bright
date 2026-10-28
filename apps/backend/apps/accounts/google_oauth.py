"""Google sign-in via the authorization-code + PKCE flow.

The browser performs the redirect and the PKCE exchange; this endpoint
receives the authorization code plus the code verifier, swaps them at
Google's token endpoint, validates the resulting tokens and returns the
same JWT payload as the password login.
"""

import logging
import re
import secrets
import time

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.legal import record_consent

from .serializers import UserSerializer
from .services import tokens_for_user

User = get_user_model()
logger = logging.getLogger(__name__)

TOKEN_URL = "https://oauth2.googleapis.com/token"
VALID_ISSUERS = ("https://accounts.google.com", "accounts.google.com")
USERNAME_ALLOWED = re.compile(r"[^a-zA-Z0-9_.@+-]")


class GoogleAuthError(Exception):
    def __init__(self, message, code=status.HTTP_400_BAD_REQUEST):
        super().__init__(message)
        self.message = message
        self.code = code


def _decode_id_token(id_token):
    """Validate the Google ID token claims server-side."""
    try:
        import jwt
    except ImportError:  # pragma: no cover - PyJWT ships with the backend
        jwt = None
    if jwt is not None:
        try:
            claims = jwt.decode(
                id_token,
                options={"verify_signature": False},
                audience=settings.GOOGLE_CLIENT_ID,
            )
        except Exception as exc:  # malformed token
            raise GoogleAuthError(f"Invalid Google credential: {exc}") from exc
    else:  # pragma: no cover
        raise GoogleAuthError("Google credential decoding is unavailable.")

    if claims.get("iss") not in VALID_ISSUERS:
        raise GoogleAuthError("Invalid Google token issuer.")
    if claims.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError("Invalid Google token audience.")
    exp = claims.get("exp")
    if exp is None or exp < time.time():
        raise GoogleAuthError("Google token has expired.")
    if not claims.get("email") or not claims.get("email_verified"):
        raise GoogleAuthError("The Google account has no verified email address.")
    return claims


def _unique_username(base):
    cleaned = USERNAME_ALLOWED.sub("", base).strip("._@+-")[:120] or "scholar"
    candidate = cleaned
    while User.objects.filter(username=candidate).exists():
        candidate = f"{cleaned[:100]}{secrets.token_hex(4)}"
    return candidate


def _username_from(claims):
    email = claims["email"]
    prefix = email.split("@", 1)[0].replace(".", "").lower()
    if prefix:
        return _unique_username(prefix)
    name = claims.get("name") or claims.get("given_name") or "scholar"
    return _unique_username(name.replace(".", ""))


class GoogleOAuthView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
            return Response(
                {"detail": "Google sign-in is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        code = (request.data.get("code") or "").strip()
        verifier = (request.data.get("code_verifier") or "").strip()
        redirect_uri = (request.data.get("redirect_uri") or settings.GOOGLE_REDIRECT_URI).strip()
        if not code or not verifier:
            return Response(
                {"detail": "Both 'code' and 'code_verifier' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            claims = self._exchange(code, verifier, redirect_uri)
        except GoogleAuthError as exc:
            return Response({"detail": exc.message}, status=exc.code)
        except requests.RequestException:
            logger.exception("Google token exchange failed")
            return Response(
                {"detail": "Could not reach Google. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        user, created = self._get_or_create_user(claims)
        if created:
            record_consent(user, request=request, accept_terms=True, accept_privacy=True)
        payload = tokens_for_user(user)
        payload["user"] = UserSerializer(user, context={"request": request}).data
        payload["created"] = created
        return Response(payload)

    def _exchange(self, code, verifier, redirect_uri):
        resp = requests.post(
            TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": verifier,
                "redirect_uri": redirect_uri,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            detail = "Google rejected the authorization code."
            try:
                detail = resp.json().get("error_description") or detail
            except ValueError:
                pass
            raise GoogleAuthError(detail)
        tokens = resp.json()
        id_token = tokens.get("id_token")
        if not id_token:
            raise GoogleAuthError("Google did not return an ID token.")
        return _decode_id_token(id_token)

    def _get_or_create_user(self, claims):
        email = claims["email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user:
            return user, False
        with transaction.atomic():
            user = User.objects.create(
                username=_username_from(claims),
                email=email,
                first_name=(claims.get("given_name") or "")[:150],
                last_name=(claims.get("family_name") or "")[:150],
                is_email_verified=True,
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])
        return user, True
