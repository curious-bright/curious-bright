from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase

from apps.core.admin import dashboard_callback

User = get_user_model()


class AdminDashboardTests(TestCase):
    def test_dashboard_callback_does_not_hit_missing_settings(self):
        request = RequestFactory().get("/admin/")
        request.user = User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="Str0ng!Passw0rd99",
        )
        context = dashboard_callback(request, {})
        self.assertIn("dashboard_stats", context)
        self.assertNotIn("error", context["dashboard_stats"])
