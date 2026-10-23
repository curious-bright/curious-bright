from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import Follow, Profile
from apps.messaging.models import (
    Conversation,
    Message,
    MessageReport,
    UserBlock,
)

User = get_user_model()


class PrivateMessagingAPITests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="Str0ng!Passw0rd99"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="Str0ng!Passw0rd99"
        )
        self.charlie = User.objects.create_user(
            username="charlie", email="charlie@example.com", password="Str0ng!Passw0rd99"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)

    def start(self):
        response = self.client.post(
            "/api/messages/conversations/",
            {"username": "bob", "message": "Hello Bob"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_start_conversation_is_idempotent_and_participant_only(self):
        conversation = self.start()
        self.assertEqual(conversation["other_user"]["username"], "bob")
        self.assertEqual(conversation["unread_count"], 0)

        again = self.client.post(
            "/api/messages/conversations/", {"username": "bob"}, format="json"
        )
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["id"], conversation["id"])
        self.assertEqual(Conversation.objects.count(), 1)
        self.assertEqual(Message.objects.count(), 1)

        self.client.force_authenticate(user=self.bob)
        self.assertEqual(
            self.client.get(
                f"/api/messages/conversations/{conversation['id']}/messages/"
            ).status_code,
            200,
        )

        self.client.force_authenticate(user=self.charlie)
        self.assertEqual(
            self.client.get(
                f"/api/messages/conversations/{conversation['id']}/messages/"
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                f"/api/messages/conversations/{conversation['id']}/messages/",
                {"body": "Intruder"},
                format="json",
            ).status_code,
            404,
        )

    def test_privacy_nobody_blocks_new_but_not_existing_conversations(self):
        conversation = self.start()
        self.bob.profile.message_privacy = Profile.MessagePrivacy.NOBODY
        self.bob.profile.save(update_fields=["message_privacy"])

        self.client.force_authenticate(user=self.charlie)
        blocked = self.client.post(
            "/api/messages/conversations/", {"username": "bob"}, format="json"
        )
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["code"], "messaging_not_allowed")

        self.client.force_authenticate(user=self.alice)
        reply = self.client.post(
            f"/api/messages/conversations/{conversation['id']}/messages/",
            {"body": "Existing conversation still works"},
            format="json",
        )
        self.assertEqual(reply.status_code, 201, reply.content)

    def test_privacy_follows_allows_only_people_target_follows_back(self):
        self.bob.profile.message_privacy = Profile.MessagePrivacy.FOLLOWS
        self.bob.profile.save(update_fields=["message_privacy"])

        denied = self.client.post(
            "/api/messages/conversations/", {"username": "bob"}, format="json"
        )
        self.assertEqual(denied.status_code, 403)

        Follow.objects.create(follower=self.bob, followed=self.alice)
        allowed = self.client.post(
            "/api/messages/conversations/", {"username": "bob"}, format="json"
        )
        self.assertEqual(allowed.status_code, 201, allowed.content)

    def test_message_privacy_is_editable_through_me(self):
        response = self.client.patch(
            "/api/auth/me/", {"message_privacy": "nobody"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["profile"]["message_privacy"], "nobody")

    def test_unread_counts_and_read_receipts(self):
        conversation = self.start()
        self.client.force_authenticate(user=self.bob)
        unread = self.client.get("/api/messages/unread/").json()
        self.assertEqual(unread["total"], 1)
        self.assertEqual(unread["by_conversation"][str(conversation["id"])], 1)

        messages = self.client.get(
            f"/api/messages/conversations/{conversation['id']}/messages/"
        ).json()["messages"]
        self.assertEqual(messages[0]["body"], "Hello Bob")
        self.assertIsNone(messages[0]["read_at"])

        read = self.client.post(
            f"/api/messages/conversations/{conversation['id']}/read/"
        )
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.json()["read"], 1)
        self.assertEqual(self.client.get("/api/messages/unread/").json()["total"], 0)

        self.client.force_authenticate(user=self.alice)
        seen = self.client.get(
            f"/api/messages/conversations/{conversation['id']}/messages/"
        ).json()["messages"]
        self.assertIsNotNone(seen[0]["read_at"])

    def test_blocking_stops_new_messages_but_keeps_history(self):
        conversation = self.start()
        block = self.client.post("/api/messages/blocks/bob/")
        self.assertEqual(block.status_code, 201)
        self.assertTrue(UserBlock.either_direction(self.alice, self.bob))

        blocked = self.client.post(
            f"/api/messages/conversations/{conversation['id']}/messages/",
            {"body": "Still there?"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["code"], "messaging_blocked")

        self.client.force_authenticate(user=self.bob)
        history = self.client.get(
            f"/api/messages/conversations/{conversation['id']}/messages/"
        )
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.json()["messages"]), 1)
        bob_summary = self.client.get("/api/messages/conversations/").json()[0]
        self.assertTrue(bob_summary["blocked_by_other"])
        self.assertFalse(bob_summary["blocked_by_me"])
        self.assertFalse(bob_summary["can_send"])

        self.client.force_authenticate(user=self.alice)
        alice_summary = self.client.get("/api/messages/conversations/").json()[0]
        self.assertTrue(alice_summary["blocked_by_me"])
        self.assertFalse(alice_summary["blocked_by_other"])

        self.assertEqual(
            self.client.delete("/api/messages/blocks/bob/").status_code, 200
        )
        self.assertFalse(UserBlock.either_direction(self.alice, self.bob))

    def test_delete_is_sender_only_and_leaves_a_tombstone(self):
        conversation = self.start()
        message = Message.objects.get(conversation_id=conversation["id"])

        self.client.force_authenticate(user=self.bob)
        forbidden = self.client.delete(f"/api/messages/{message.pk}/")
        self.assertEqual(forbidden.status_code, 403)

        self.client.force_authenticate(user=self.alice)
        deleted = self.client.delete(f"/api/messages/{message.pk}/")
        self.assertEqual(deleted.status_code, 200)
        message.refresh_from_db()
        self.assertIsNotNone(message.deleted_at)
        self.assertEqual(message.body, "")

        tombstone = self.client.get(
            f"/api/messages/conversations/{conversation['id']}/messages/"
        ).json()["messages"][0]
        self.assertTrue(tombstone["deleted"])
        self.assertEqual(tombstone["body"], "")

    def test_participant_can_report_a_message(self):
        conversation = self.start()
        message = Message.objects.get(conversation_id=conversation["id"])
        self.client.force_authenticate(user=self.bob)
        response = self.client.post(
            f"/api/messages/{message.pk}/report/",
            {"reason": "Harassment"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(
            MessageReport.objects.filter(
                message=message, reporter=self.bob, reason="Harassment"
            ).exists()
        )

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_empty_and_overlong_messages_are_rejected(self):
        conversation = self.start()
        self.assertEqual(
            self.client.post(
                f"/api/messages/conversations/{conversation['id']}/messages/",
                {"body": "   "},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                f"/api/messages/conversations/{conversation['id']}/messages/",
                {"body": "x" * 4001},
                format="json",
            ).status_code,
            400,
        )
