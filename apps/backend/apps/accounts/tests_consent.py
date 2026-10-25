from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import PolicyConsent
from apps.core.legal import CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_PROVIDER="console",
    EMAIL_DELIVERY_ASYNC=False,
)
class ConsentTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def register(self, **overrides):
        payload = {
            "username": "consenting",
            "email": "consenting@example.com",
            "password": "Str0ng!Passw0rd99",
            "accept_terms": True,
            "accept_privacy": True,
        }
        payload.update(overrides)
        return self.client.post("/api/auth/register/", payload, format="json")

    def test_registration_requires_both_policy_acceptances(self):
        response = self.register(accept_terms=False)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="consenting").exists())

        response = self.register(accept_privacy=False)
        self.assertEqual(response.status_code, 400)

    def test_registration_records_versioned_consent(self):
        response = self.register()
        self.assertEqual(response.status_code, 201, response.content)
        user = User.objects.get(username="consenting")
        rows = PolicyConsent.objects.filter(user=user).order_by("policy_type")
        self.assertEqual(rows.count(), 2)
        self.assertEqual(
            set(rows.values_list("policy_type", flat=True)),
            {PolicyConsent.PolicyType.TERMS, PolicyConsent.PolicyType.PRIVACY},
        )
        self.assertEqual(
            set(rows.values_list("version", flat=True)),
            {CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION},
        )

    def test_me_exposes_current_consent_state(self):
        user = User.objects.create_user(
            username="existing",
            email="existing@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client.force_authenticate(user=user)
        body = self.client.get("/api/auth/me/").json()
        self.assertFalse(body["consent"]["terms"]["accepted"])
        self.assertFalse(body["consent"]["privacy"]["accepted"])
        self.assertEqual(body["consent"]["terms"]["version"], CURRENT_TERMS_VERSION)

    def test_accepting_current_policies_unblocks_the_gate(self):
        user = User.objects.create_user(
            username="existing",
            email="existing@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client.force_authenticate(user=user)
        response = self.client.post(
            "/api/auth/consent/",
            {"accept_terms": True, "accept_privacy": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["consent"]["terms"]["accepted"])
        self.assertTrue(response.json()["consent"]["privacy"]["accepted"])
        self.assertEqual(PolicyConsent.objects.filter(user=user).count(), 2)

    def test_consent_endpoint_requires_both_flags(self):
        user = User.objects.create_user(
            username="existing",
            email="existing@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client.force_authenticate(user=user)
        response = self.client.post(
            "/api/auth/consent/",
            {"accept_terms": True, "accept_privacy": False},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(PolicyConsent.objects.filter(user=user).exists())

    def test_new_policy_version_forces_reacceptance(self):
        user = User.objects.create_user(
            username="existing",
            email="existing@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client.force_authenticate(user=user)
        self.client.post(
            "/api/auth/consent/",
            {"accept_terms": True, "accept_privacy": True},
            format="json",
        )
        with patch("apps.core.legal.CURRENT_TERMS_VERSION", "2027-01-01"):
            body = self.client.get("/api/auth/me/").json()
        self.assertFalse(body["consent"]["terms"]["accepted"])
        self.assertEqual(body["consent"]["terms"]["version"], "2027-01-01")

        with patch("apps.core.legal.CURRENT_TERMS_VERSION", "2027-01-01"):
            response = self.client.post(
                "/api/auth/consent/",
                {"accept_terms": True, "accept_privacy": True},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["consent"]["terms"]["accepted"])
        self.assertTrue(
            PolicyConsent.objects.filter(user=user, version="2027-01-01").exists()
        )

    def test_organization_creation_records_org_scoped_consent(self):
        user = User.objects.create_user(
            username="orgowner",
            email="orgowner@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client.force_authenticate(user=user)
        response = self.client.post(
            "/api/organizations/",
            {
                "name": "Consent University",
                "domain": "consent.edu",
                "accept_terms": True,
                "accept_privacy": True,
            },
            format="json",
            HTTP_X_CLIENT_APP="institutional",
        )
        self.assertEqual(response.status_code, 201, response.content)
        rows = PolicyConsent.objects.filter(user=user, organization__isnull=False)
        self.assertEqual(rows.count(), 2)

    def test_organization_creation_requires_consent_flags(self):
        user = User.objects.create_user(
            username="orgowner",
            email="orgowner@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client.force_authenticate(user=user)
        response = self.client.post(
            "/api/organizations/",
            {"name": "No Consent", "domain": "noconsent.edu"},
            format="json",
            HTTP_X_CLIENT_APP="institutional",
        )
        self.assertEqual(response.status_code, 400)

    def test_legal_versions_are_public(self):
        response = self.client.get("/api/legal/versions/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["terms"], CURRENT_TERMS_VERSION)
        self.assertEqual(body["privacy"], CURRENT_PRIVACY_VERSION)
        self.assertTrue(body["last_updated"])
