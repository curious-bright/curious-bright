from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.cache import cache
from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from apps.core.admin_analytics import can_view_analytics, collect_metrics, get_metrics

User = get_user_model()


class AdminAnalyticsPermissionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="analyst",
            email="analyst@example.com",
            password="Str0ng!Passw0rd99",
            is_staff=True,
        )
        self.superuser = User.objects.create_superuser(
            username="root",
            email="root@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.permission = Permission.objects.get(
            codename="view_analytics", content_type__app_label="core"
        )

    def test_staff_without_permission_is_forbidden(self):
        self.client.force_login(self.staff)
        response = self.client.get("/admin/analytics/")
        self.assertEqual(response.status_code, 403)
        export = self.client.get("/admin/analytics/export/")
        self.assertEqual(export.status_code, 403)

    def test_staff_with_permission_can_view_dashboard(self):
        self.staff.user_permissions.add(self.permission)
        self.client.force_login(self.staff)
        response = self.client.get("/admin/analytics/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Analytics")
        self.assertContains(response, "Local PostgreSQL data only")

    def test_superuser_can_view_without_explicit_permission(self):
        self.client.force_login(self.superuser)
        response = self.client.get("/admin/analytics/")
        self.assertEqual(response.status_code, 200)

    def test_csv_export_requires_permission_and_has_expected_headers(self):
        self.staff.user_permissions.add(self.permission)
        self.client.force_login(self.staff)
        response = self.client.get("/admin/analytics/export/?start=2026-01-01&end=2026-01-31")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("attachment;", response["Content-Disposition"])
        body = response.content.decode()
        self.assertIn("Section,Metric,Value", body)
        self.assertIn("Organizations,Total", body)
        self.assertIn("Verification funnel", body)

    def test_date_range_is_clamped_and_invalid_input_falls_back(self):
        self.client.force_login(self.superuser)
        response = self.client.get("/admin/analytics/?start=not-a-date&end=2026-01-31")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "2026-01-31")

    def test_nav_permission_callback_accepts_a_request(self):
        request = RequestFactory().get("/admin/")
        request.user = self.staff
        self.assertFalse(can_view_analytics(request))
        self.staff.user_permissions.add(self.permission)
        request.user = User.objects.get(pk=self.staff.pk)
        self.assertTrue(can_view_analytics(request))

    def test_metrics_collection_does_not_expose_message_bodies(self):
        metrics = collect_metrics(
            __import__("datetime").date(2026, 1, 1),
            __import__("datetime").date(2026, 1, 31),
        )
        rendered = str(metrics)
        self.assertNotIn("private message body", rendered)
        self.assertIn("organizations", metrics)
        self.assertIn("platform", metrics)
