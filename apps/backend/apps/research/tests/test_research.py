from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.research.models import Collaboration, ResearchDocument, ResearchDocumentRevision

User = get_user_model()


class ResearchDocumentTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com", password="Str0ng!Passw0rd99"
        )
        self.collaborator = User.objects.create_user(
            username="collaborator", email="collab@example.com", password="Str0ng!Passw0rd99"
        )
        self.stranger = User.objects.create_user(
            username="stranger", email="stranger@example.com", password="Str0ng!Passw0rd99"
        )
        self.client = APIClient()

    def create_document(self, **overrides):
        payload = {
            "title": "A small theorem",
            "abstract": "An abstract.",
            "body": "The proof.",
            "field": "Mathematics",
            "status": "draft",
            **overrides,
        }
        self.client.force_authenticate(user=self.owner)
        response = self.client.post("/api/research/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return ResearchDocument.objects.get(pk=response.json()["id"])

    def test_create_takes_first_revision_and_owner_flags(self):
        doc = self.create_document()
        self.assertEqual(doc.revisions.count(), 1)
        self.assertEqual(
            ResearchDocumentRevision.objects.get(document=doc).title, "A small theorem"
        )
        self.assertEqual(doc.owner, self.owner)
        body = self.client.get(f"/api/research/{doc.pk}/").json()
        self.assertTrue(body["mine"])
        self.assertTrue(body["can_edit"])
        self.assertEqual(body["revision_count"], 1)
        self.assertNotIn("email", body["owner"])

    def test_draft_is_private_but_published_is_public_to_signed_in_users(self):
        doc = self.create_document()
        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(self.client.get(f"/api/research/{doc.pk}/").status_code, 404)
        self.assertNotIn(doc.pk, [row["id"] for row in self.client.get("/api/research/").json()["results"]])

        doc.status = ResearchDocument.Status.PUBLISHED
        doc.save(update_fields=["status"])
        self.assertEqual(self.client.get(f"/api/research/{doc.pk}/").status_code, 200)

    def test_collaborator_invitation_flow_grants_edit_access(self):
        doc = self.create_document()
        self.client.force_authenticate(user=self.owner)
        invited = self.client.post(
            f"/api/research/{doc.pk}/invite/",
            {"username": self.collaborator.username, "role": "co_author"},
            format="json",
        )
        self.assertEqual(invited.status_code, 201)
        collaboration_id = invited.json()["id"]

        self.client.force_authenticate(user=self.collaborator)
        invitations = self.client.get("/api/research/invitations/")
        rows = invitations.json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertEqual([row["id"] for row in rows], [collaboration_id])
        accepted = self.client.post(
            f"/api/research/invitations/{collaboration_id}/respond/",
            {"action": "accept"},
            format="json",
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(self.client.get(f"/api/research/{doc.pk}/").status_code, 200)
        response = self.client.patch(
            f"/api/research/{doc.pk}/",
            {"body": "Improved proof.", "summary": "Tightened the argument"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        doc.refresh_from_db()
        self.assertTrue(doc.is_edited)
        self.assertEqual(doc.body, "Improved proof.")
        self.assertEqual(doc.revisions.count(), 2)

    def test_stranger_cannot_edit_or_invite(self):
        doc = self.create_document()
        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(
            self.client.patch(
                f"/api/research/{doc.pk}/", {"body": "Hijack"}, format="json"
            ).status_code,
            404,
        )
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(
            self.client.post(
                f"/api/research/{doc.pk}/invite/", {"username": "stranger"}, format="json"
            ).status_code,
            201,
        )
        Collaboration.objects.filter(document=doc, user=self.stranger).update(
            status=Collaboration.Status.DECLINED
        )
        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(
            self.client.patch(
                f"/api/research/{doc.pk}/", {"body": "Hijack"}, format="json"
            ).status_code,
            404,
        )

    def test_revision_restore_creates_new_snapshot(self):
        doc = self.create_document()
        original_revision = doc.revisions.get()
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(
            self.client.patch(
                f"/api/research/{doc.pk}/",
                {"title": "Changed title", "body": "Changed body."},
                format="json",
            ).status_code,
            200,
        )
        revisions = self.client.get(f"/api/research/{doc.pk}/revisions/").json()
        revisions = revisions["results"] if isinstance(revisions, dict) else revisions
        self.assertEqual(len(revisions), 2)

        restored = self.client.post(
            f"/api/research/{doc.pk}/revisions/{original_revision.pk}/restore/"
        )
        self.assertEqual(restored.status_code, 200)
        doc.refresh_from_db()
        self.assertEqual(doc.title, "A small theorem")
        self.assertEqual(doc.body, "The proof.")
        self.assertEqual(doc.revisions.count(), 3)

    def test_delete_hides_document_and_restore_returns_it(self):
        doc = self.create_document()
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(self.client.delete(f"/api/research/{doc.pk}/").status_code, 204)
        self.assertFalse(ResearchDocument.objects.filter(pk=doc.pk).exists())
        self.assertEqual(self.client.get(f"/api/research/{doc.pk}/").status_code, 404)
        self.assertEqual(self.client.post(f"/api/research/{doc.pk}/restore/").status_code, 200)
        self.assertTrue(ResearchDocument.objects.filter(pk=doc.pk).exists())

    def test_restore_window_expires(self):
        doc = self.create_document()
        doc.delete(deleted_by=self.owner)
        ResearchDocument.all_objects.filter(pk=doc.pk).update(
            deleted_at=timezone.now() - timedelta(hours=1)
        )
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(f"/api/research/{doc.pk}/restore/")
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["code"], "restore_window_expired")

    def test_non_owner_cannot_delete_or_change_status(self):
        doc = self.create_document(status="published")
        collab = Collaboration.objects.create(
            document=doc,
            user=self.collaborator,
            status=Collaboration.Status.ACCEPTED,
        )
        self.assertTrue(collab.pk)
        self.client.force_authenticate(user=self.collaborator)
        self.assertEqual(self.client.delete(f"/api/research/{doc.pk}/").status_code, 403)
        response = self.client.patch(
            f"/api/research/{doc.pk}/",
            {"status": "archived"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        doc.refresh_from_db()
        self.assertEqual(doc.status, "published")
