from django.contrib.admin.models import LogEntry
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.community.models import Notification
from apps.moderation.models import ModeratorApplication

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class ModeratorApprovalTests(TestCase):
    def setUp(self):
        self.reviewer = User.objects.create_user(
            username="reviewer",
            email="reviewer@example.com",
            password="Str0ng!Passw0rd99",
            is_moderator=True,
        )
        self.applicant = User.objects.create_user(
            username="applicant",
            email="applicant@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.application = ModeratorApplication.objects.create(
            user=self.applicant,
            motivation="I want to help.",
            subjects=["Mathematics"],
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.reviewer)

    def test_approval_sets_role_notifies_and_audits(self):
        response = self.client.post(
            f"/api/moderator-applications/{self.application.pk}/approve/",
            {"note": "Strong application."},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.application.refresh_from_db()
        self.applicant.refresh_from_db()
        self.assertEqual(self.application.status, ModeratorApplication.Status.APPROVED)
        self.assertEqual(self.application.review_note, "Strong application.")
        self.assertTrue(self.applicant.is_moderator)
        self.assertTrue(
            Notification.objects.filter(
                user=self.applicant, verb=Notification.VERB.REVIEW
            ).exists()
        )
        self.assertTrue(any("applicant@example.com" in message.to for message in mail.outbox))
        self.assertTrue(
            LogEntry.objects.filter(
                object_id=str(self.application.pk),
                change_message__icontains="Strong application",
            ).exists()
        )

    def test_decline_does_not_grant_role_and_records_note(self):
        response = self.client.post(
            f"/api/moderator-applications/{self.application.pk}/decline/",
            {"note": "Please gain more experience."},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.application.refresh_from_db()
        self.applicant.refresh_from_db()
        self.assertEqual(self.application.status, ModeratorApplication.Status.REJECTED)
        self.assertIn("more experience", self.application.review_note)
        self.assertFalse(self.applicant.is_moderator)
