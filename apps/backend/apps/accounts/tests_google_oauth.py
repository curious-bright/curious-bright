import time
from unittest.mock import patch

import jwt
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

User = get_user_model()

CLIENT_ID = "test-client.apps.googleusercontent.com"
CLIENT_SECRET = "test-secret"
REDIRECT_URI = "https://app.curiousbright.com.ng/auth/google/callback"
URL = "/api/auth/google/"

GOOGLE_SETTINGS = {
    "GOOGLE_CLIENT_ID": CLIENT_ID,
    "GOOGLE_CLIENT_SECRET": CLIENT_SECRET,
    "GOOGLE_REDIRECT_URI": REDIRECT_URI,
}


def id_token(**overrides):
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "google-user-1",
        "email": "Ada.Lovelace@Example.com",
        "email_verified": True,
        "name": "Ada Lovelace",
        "given_name": "Ada",
        "family_name": "Lovelace",
        "exp": int(time.time()) + 600,
    }
    claims.update(overrides)
    return jwt.encode(claims, "secret", algorithm="HS256")


class FakeGoogleResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


@override_settings(**GOOGLE_SETTINGS)
class GoogleOAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def post_code(self, code="auth-code", verifier="x" * 64, **kwargs):
        return self.client.post(
            URL,
            {"code": code, "code_verifier": verifier, "redirect_uri": REDIRECT_URI},
            format="json",
            **kwargs,
        )

    def exchange(self, token_response):
        return patch(
            "apps.accounts.google_oauth.requests.post", return_value=token_response
        )

    def test_missing_fields_rejected(self):
        response = self.client.post(URL, {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_existing_user_gets_tokens(self):
        user = User.objects.create_user(
            username="ada", email="ada@example.com", password="Str0ng!Passw0rd99"
        )
        cache.clear()
        with self.exchange(
            FakeGoogleResponse(200, {"id_token": id_token(email="ada@example.com")})
        ):
            response = self.post_code()
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["id"], user.id)
        self.assertFalse(response.data["created"])
        self.assertEqual(User.objects.count(), 1)

    def test_new_user_created_verified_without_password(self):
        with self.exchange(FakeGoogleResponse(200, {"id_token": id_token()})):
            response = self.post_code()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["created"])
        user = User.objects.get(email="ada.lovelace@example.com")
        self.assertEqual(user.username, "adalovelace")
        self.assertTrue(user.is_email_verified)
        self.assertFalse(user.has_usable_password())
        self.assertTrue(user.profile is not None)
        self.assertEqual(response.data["user"]["username"], user.username)

    def test_username_collision_gets_suffix(self):
        User.objects.create_user(
            username="adalovelace", email="other@example.com", password="Str0ng!Passw0rd99"
        )
        cache.clear()
        with self.exchange(
            FakeGoogleResponse(
                200, {"id_token": id_token(email="ada.lovelace@example.com")}
            )
        ):
            response = self.post_code()
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="ada.lovelace@example.com")
        self.assertNotEqual(user.username, "adalovelace")
        self.assertTrue(user.username.startswith("adalovelace"))

    def test_google_rejection_surfaces_error(self):
        with self.exchange(
            FakeGoogleResponse(
                400, {"error_description": "Bad Request"}
            )
        ):
            response = self.post_code(code="expired-code")
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.data)

    def test_unverified_email_rejected(self):
        with self.exchange(
            FakeGoogleResponse(
                200, {"id_token": id_token(email_verified=False)}
            )
        ):
            response = self.post_code()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.filter(email="ada.lovelace@example.com").count(), 0)

    def test_wrong_audience_rejected(self):
        with self.exchange(
            FakeGoogleResponse(200, {"id_token": id_token(aud="someone-else")})
        ):
            response = self.post_code()
        self.assertEqual(response.status_code, 400)

    def test_expired_token_rejected(self):
        with self.exchange(
            FakeGoogleResponse(200, {"id_token": id_token(exp=int(time.time()) - 10)})
        ):
            response = self.post_code()
        self.assertEqual(response.status_code, 400)

    def test_missing_id_token_rejected(self):
        with self.exchange(FakeGoogleResponse(200, {})):
            response = self.post_code()
        self.assertEqual(response.status_code, 400)


@override_settings(GOOGLE_CLIENT_ID="", GOOGLE_CLIENT_SECRET="")
class GoogleOAuthDisabledTests(TestCase):
    def test_endpoint_reports_unavailable(self):
        response = APIClient().post(
            URL, {"code": "c", "code_verifier": "v"}, format="json"
        )
        self.assertEqual(response.status_code, 503)
