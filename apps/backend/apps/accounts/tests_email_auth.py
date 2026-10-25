import importlib
import re
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import EmailVerificationCode, PasswordResetToken
from apps.organizations.models import Organization, OrganizationMembership

User = get_user_model()
PASSWORD = "Str0ng!Passw0rd99"
NEW_PASSWORD = "N3w!Passw0rd99"


class FakeResponse:
    def __init__(self, status_code=200):
        self.status_code = status_code


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_PROVIDER="console",
    EMAIL_DELIVERY_ASYNC=False,
    EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60,
    EMAIL_VERIFICATION_MAX_ATTEMPTS=5,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class EmailAuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        mail.outbox.clear()
        # DRF throttle history lives in the cache and survives TestCase
        # rollbacks, so a full-suite run can otherwise exhaust the shared auth
        # scope before these tests register.
        cache.clear()

    def register(self, username="newmember", email="new@example.com", password=PASSWORD):
        return self.client.post(
            "/api/auth/register/",
            {
                "username": username,
                "email": email,
                "password": password,
                "accept_terms": True,
                "accept_privacy": True,
            },
            format="json",
        )

    def verify(self, email, code):
        return self.client.post(
            "/api/auth/verify-email/",
            {"email": email, "code": code},
            format="json",
        )

    def test_successful_verification_marks_verified_and_returns_jwt(self):
        with patch("apps.accounts.services._generate_code", return_value="123456"):
            response = self.register()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()["verification_required"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Your CuriousBright verification code")
        self.assertIn("123456", mail.outbox[0].body)
        self.assertIn("It expires in 10 minutes.", mail.outbox[0].body)

        user = User.objects.get(email="new@example.com")
        self.assertFalse(user.is_email_verified)
        record = EmailVerificationCode.objects.get(user=user)
        self.assertNotIn("123456", record.code_hash)
        self.assertIsNone(record.consumed_at)

        response = self.verify("new@example.com", "123456")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)
        self.assertTrue(body["user"]["is_email_verified"])

        user.refresh_from_db()
        self.assertTrue(user.is_email_verified)
        self.assertTrue(hasattr(user, "profile"))

        me = self.client.get(
            "/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {body['access']}"
        )
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["email"], "new@example.com")

    def test_wrong_code_is_rejected_and_counted(self):
        with patch("apps.accounts.services._generate_code", return_value="123456"):
            self.register()

        response = self.verify("new@example.com", "654321")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_code")
        self.assertIn("4 attempts remaining", response.json()["message"])
        record = EmailVerificationCode.objects.get(user__email="new@example.com")
        self.assertEqual(record.attempts, 1)
        self.assertIsNone(record.consumed_at)

    def test_expired_code_is_rejected(self):
        with patch("apps.accounts.services._generate_code", return_value="123456"):
            self.register()
        EmailVerificationCode.objects.filter(user__email="new@example.com").update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )

        response = self.verify("new@example.com", "123456")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "code_expired")
        self.assertFalse(User.objects.get(email="new@example.com").is_email_verified)

    def test_used_code_cannot_be_replayed(self):
        with patch("apps.accounts.services._generate_code", return_value="123456"):
            self.register()
        self.assertEqual(self.verify("new@example.com", "123456").status_code, 200)

        # Simulate the narrow state where the user's verified flag was later
        # cleared (admin action) while the old code row is still present.
        user = User.objects.get(email="new@example.com")
        user.is_email_verified = False
        user.save(update_fields=["is_email_verified"])

        response = self.verify("new@example.com", "123456")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "code_used")

    def test_five_wrong_attempts_lock_the_code(self):
        with patch("apps.accounts.services._generate_code", return_value="123456"):
            self.register()

        for attempt in range(1, 6):
            response = self.verify("new@example.com", "000000")
            self.assertEqual(response.status_code, 400)
            expected = "code_locked" if attempt == 5 else "invalid_code"
            self.assertEqual(response.json()["code"], expected)

        record = EmailVerificationCode.objects.get(user__email="new@example.com")
        self.assertEqual(record.attempts, 5)
        self.assertIsNotNone(record.consumed_at)
        self.assertEqual(self.verify("new@example.com", "123456").json()["code"], "code_locked")

    def test_resend_cooldown_blocks_immediate_second_email(self):
        with patch("apps.accounts.services._generate_code", return_value="123456"):
            self.register()
        self.assertEqual(len(mail.outbox), 1)

        response = self.client.post(
            "/api/auth/resend-code/", {"email": "new@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["code"], "resend_cooldown")
        self.assertEqual(len(mail.outbox), 1)

        EmailVerificationCode.objects.filter(user__email="new@example.com").update(
            created_at=timezone.now() - timedelta(seconds=61)
        )
        with patch("apps.accounts.services._generate_code", return_value="222222"):
            response = self.client.post(
                "/api/auth/resend-code/", {"email": "new@example.com"}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 2)
        self.assertTrue(response.json()["email_sent"])

        # Resending invalidates the old code.
        self.assertEqual(self.verify("new@example.com", "123456").json()["code"], "invalid_code")
        self.assertEqual(self.verify("new@example.com", "222222").status_code, 200)

    def test_unverified_login_is_blocked_with_explanatory_code(self):
        with patch("apps.accounts.services._generate_code", return_value="123456"):
            self.register()

        response = self.client.post(
            "/api/auth/token/",
            {"username": "new@example.com", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "email_unverified")
        self.assertIn("verify your email", response.json()["message"].lower())
        self.assertNotIn("access", response.json())

    def test_duplicate_unverified_registration_is_rejected(self):
        with patch("apps.accounts.services._generate_code", return_value="123456"):
            self.register()
        response = self.register(username="different", email="NEW@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertIn("already registered", response.json()["message"])
        self.assertEqual(User.objects.filter(email__iexact="new@example.com").count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_change_email_requires_password_and_sends_a_new_code(self):
        with patch("apps.accounts.services._generate_code", side_effect=["123456", "654321"]):
            self.register()
            response = self.client.post(
                "/api/auth/change-email/",
                {
                    "email": "new@example.com",
                    "password": PASSWORD,
                    "new_email": "corrected@example.com",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["email"], "corrected@example.com")
        self.assertEqual(len(mail.outbox), 2)
        user = User.objects.get(email="corrected@example.com")
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.is_email_verified)

        # The old code is dead and the new one works.
        self.assertEqual(self.verify("corrected@example.com", "123456").json()["code"], "invalid_code")
        self.assertEqual(self.verify("corrected@example.com", "654321").status_code, 200)

    def test_existing_users_are_marked_verified_by_the_data_migration(self):
        user = User.objects.create_user(
            username="legacy", email="legacy@example.com", password=PASSWORD
        )
        self.assertFalse(user.is_email_verified)
        migration = importlib.import_module(
            "apps.accounts.migrations.0006_alter_user_managers_user_is_email_verified_and_more"
        )
        migration.mark_existing_users_verified(django_apps, None)
        user.refresh_from_db()
        self.assertTrue(user.is_email_verified)

    def test_superusers_are_created_verified(self):
        admin = User.objects.create_superuser(
            username="newadmin", email="admin@example.com", password=PASSWORD
        )
        self.assertTrue(admin.is_email_verified)

    def test_org_created_student_accounts_skip_verification(self):
        owner = User.objects.create_user(
            username="orgowner",
            email="owner@school.edu",
            password=PASSWORD,
            is_email_verified=True,
        )
        org = Organization.objects.create(
            name="Test School",
            owner=owner,
            verification_status=Organization.VerificationStatus.VERIFIED,
            verified_at=timezone.now(),
        )
        OrganizationMembership.objects.create(
            organization=org,
            user=owner,
            role=OrganizationMembership.Role.OWNER,
        )
        self.client.force_authenticate(user=owner)
        response = self.client.post(
            f"/api/organizations/{org.slug}/students/",
            {"username": "newstudent", "email": "student@school.edu"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        student = User.objects.get(email="student@school.edu")
        self.assertTrue(student.is_email_verified)

    def test_csv_imported_students_skip_verification(self):
        owner = User.objects.create_user(
            username="csvowner",
            email="csvowner@school.edu",
            password=PASSWORD,
            is_email_verified=True,
        )
        org = Organization.objects.create(
            name="CSV School",
            owner=owner,
            verification_status=Organization.VerificationStatus.VERIFIED,
            verified_at=timezone.now(),
        )
        OrganizationMembership.objects.create(
            organization=org,
            user=owner,
            role=OrganizationMembership.Role.OWNER,
        )
        self.client.force_authenticate(user=owner)
        upload = SimpleUploadedFile(
            "students.csv",
            b"username,email\ncsvstudent,csvstudent@school.edu\n",
            content_type="text/csv",
        )
        response = self.client.post(
            f"/api/organizations/{org.slug}/students/import/",
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.content)
        student = User.objects.get(email="csvstudent@school.edu")
        self.assertTrue(student.is_email_verified)

    def test_password_reset_token_expires(self):
        user = User.objects.create_user(
            username="expiredreset",
            email="expiredreset@example.com",
            password=PASSWORD,
            is_email_verified=True,
        )
        response = self.client.post(
            "/api/auth/password-reset/", {"email": user.email}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        link = re.search(r"https?://\S+", mail.outbox[0].body).group(0)
        query = parse_qs(urlparse(link).query)
        PasswordResetToken.objects.filter(user=user).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        response = self.client.post(
            "/api/auth/password-reset/confirm/",
            {
                "uid": query["uid"][0],
                "token": query["token"][0],
                "new_password": NEW_PASSWORD,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "reset_token_expired")
        user.refresh_from_db()
        self.assertTrue(user.check_password(PASSWORD))

    def test_password_reset_always_returns_the_same_response(self):
        User.objects.create_user(
            username="resetuser",
            email="reset@example.com",
            password=PASSWORD,
            is_email_verified=True,
        )
        existing = self.client.post(
            "/api/auth/password-reset/", {"email": "reset@example.com"}, format="json"
        )
        missing = self.client.post(
            "/api/auth/password-reset/", {"email": "nobody@example.com"}, format="json"
        )
        self.assertEqual(existing.status_code, 200)
        self.assertEqual(existing.json(), missing.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Reset your CuriousBright password")


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_PROVIDER="resend",
    RESEND_API_KEY="re_test_key_never_log",
    RESEND_MAX_ATTEMPTS=1,
    RESEND_RETRY_BASE_SECONDS=0,
    EMAIL_DELIVERY_ASYNC=False,
    EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class ResendDeliveryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        mail.outbox.clear()
        cache.clear()

    def test_resend_failure_keeps_unverified_account_and_alerts(self):
        with patch(
            "apps.core.emails.requests.post", return_value=FakeResponse(500)
        ) as post:
            with self.assertLogs("apps.core.emails", level="WARNING") as captured:
                with patch("apps.accounts.services._generate_code", return_value="123456"):
                    response = self.client.post(
                        "/api/auth/register/",
                        {
                            "username": "unlucky",
                            "email": "unlucky@example.com",
                            "password": PASSWORD,
                            "accept_terms": True,
                            "accept_privacy": True,
                        },
                        format="json",
                    )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertFalse(response.json()["email_sent"])
        user = User.objects.get(email="unlucky@example.com")
        self.assertFalse(user.is_email_verified)
        self.assertTrue(EmailVerificationCode.objects.filter(user=user).exists())
        self.assertFalse(any("123456" in line for line in captured.output))
        self.assertFalse(any("re_test_key_never_log" in line for line in captured.output))
        self.assertEqual(post.call_count, 1)

        EmailVerificationCode.objects.filter(user=user).update(
            created_at=timezone.now() - timedelta(seconds=61)
        )
        with patch("apps.core.emails.requests.post", return_value=FakeResponse(500)):
            response = self.client.post(
                "/api/auth/resend-code/",
                {"email": "unlucky@example.com"},
                format="json",
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "email_delivery_failed")
        self.assertFalse(User.objects.get(pk=user.pk).is_email_verified)

    def test_template_failure_keeps_registration_successful(self):
        with patch(
            "apps.accounts.emails.render_to_string",
            side_effect=RuntimeError("template boom"),
        ):
            with self.assertLogs("apps.accounts.emails", level="WARNING") as captured:
                with patch("apps.accounts.services._generate_code", return_value="123456"):
                    response = self.client.post(
                        "/api/auth/register/",
                        {
                            "username": "templateluck",
                            "email": "templateluck@example.com",
                            "password": PASSWORD,
                            "accept_terms": True,
                            "accept_privacy": True,
                        },
                        format="json",
                    )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertFalse(response.json()["email_sent"])
        user = User.objects.get(email="templateluck@example.com")
        self.assertFalse(user.is_email_verified)
        self.assertTrue(EmailVerificationCode.objects.filter(user=user).exists())
        self.assertFalse(any("123456" in line for line in captured.output))

    def test_password_reset_and_changed_email_go_through_resend(self):
        user = User.objects.create_user(
            username="resenduser",
            email="resend@example.com",
            password=PASSWORD,
            is_email_verified=True,
        )
        with patch(
            "apps.core.emails.requests.post", return_value=FakeResponse(200)
        ) as post:
            response = self.client.post(
                "/api/auth/password-reset/", {"email": user.email}, format="json"
            )
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(post.call_count, 1)

            call = post.call_args
            payload = call.kwargs["json"]
            headers = call.kwargs["headers"]
            self.assertEqual(
                headers["Authorization"], "Bearer re_test_key_never_log"
            )
            self.assertEqual(payload["to"], [user.email])
            self.assertEqual(payload["subject"], "Reset your CuriousBright password")
            self.assertIn("CuriousBright <noreply@curiousbright.com.ng>", payload["from"])
            self.assertIn("This is an automated message from a no-reply address.", payload["text"])
            self.assertIn("This is an automated message from a no-reply address.", payload["html"])
            self.assertIn("icon-192.png", payload["html"])
            self.assertIn('alt="Curious Bright"', payload["html"])

            link = re.search(r"https?://\S+", payload["text"]).group(0)
            parsed = urlparse(link)
            query = parse_qs(parsed.query)
            uid = query["uid"][0]
            raw_token = query["token"][0]
            self.assertEqual(parsed.path, "/reset-password")
            self.assertFalse(
                PasswordResetToken.objects.filter(token_hash=raw_token).exists()
            )

            confirm = self.client.post(
                "/api/auth/password-reset/confirm/",
                {"uid": uid, "token": raw_token, "new_password": NEW_PASSWORD},
                format="json",
            )
            self.assertEqual(confirm.status_code, 200, confirm.content)
            self.assertEqual(post.call_count, 2)
            changed_payload = post.call_args.kwargs["json"]
            self.assertEqual(changed_payload["subject"], "Your password was changed")
            self.assertIn("your CuriousBright password was just changed", changed_payload["text"])

        user.refresh_from_db()
        self.assertTrue(user.check_password(NEW_PASSWORD))
        reset = PasswordResetToken.objects.get(user=user)
        self.assertIsNotNone(reset.used_at)

        # A used reset link cannot be replayed.
        again = self.client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": raw_token, "new_password": "Another!Passw0rd99"},
            format="json",
        )
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.json()["code"], "invalid_reset_token")

    @override_settings(
        APP_FRONTEND_URL="https://app.example.test",
        ORG_FRONTEND_URL="https://org.example.test",
    )
    def test_reset_link_uses_the_requesting_app_origin(self):
        User.objects.create_user(
            username="orgreset",
            email="orgreset@example.com",
            password=PASSWORD,
            is_email_verified=True,
        )
        with patch(
            "apps.core.emails.requests.post", return_value=FakeResponse(200)
        ) as post:
            response = self.client.post(
                "/api/auth/password-reset/",
                {"email": "orgreset@example.com"},
                format="json",
                HTTP_X_CLIENT_APP="institutional",
            )
        self.assertEqual(response.status_code, 200)
        payload = post.call_args.kwargs["json"]
        self.assertIn("https://org.example.test/reset-password?", payload["text"])
        self.assertNotIn("https://app.example.test/reset-password?", payload["text"])
