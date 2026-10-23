from django.conf import settings
from django.test import TestCase


class HostConfigurationTests(TestCase):
    def test_browser_clients_are_allowed_on_websockets_and_cors(self):
        self.assertIn(settings.APP_FRONTEND_URL, settings.WS_ALLOWED_ORIGINS)
        self.assertIn(settings.ORG_FRONTEND_URL, settings.WS_ALLOWED_ORIGINS)
        self.assertIn(settings.LANDING_FRONTEND_URL, settings.CORS_ALLOWED_ORIGINS)

    def test_billing_returns_to_the_institutional_portal(self):
        self.assertTrue(settings.BILLING_CALLBACK_URL.endswith("/billing/verify"))
