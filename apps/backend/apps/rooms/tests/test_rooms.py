import jwt
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.community.models import Post
from apps.core.models import ContentAuditLog
from apps.rooms.models import Room, RoomMember, RoomMessage

User = get_user_model()


class RoomAPITests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(
            username="host", email="host@example.com", password="Str0ng!Passw0rd99"
        )
        self.member = User.objects.create_user(
            username="member", email="member@example.com", password="Str0ng!Passw0rd99"
        )
        self.outsider = User.objects.create_user(
            username="outsider", email="outsider@example.com", password="Str0ng!Passw0rd99"
        )
        self.room = Room.objects.create(
            name="Calculus clinic", topic="Maths", created_by=self.host, description="Derivatives"
        )
        RoomMember.objects.create(room=self.room, user=self.host)
        RoomMember.objects.create(room=self.room, user=self.member)
        self.client = APIClient()

    def test_create_room_adds_host_as_member(self):
        self.client.force_authenticate(user=self.host)
        response = self.client.post(
            "/api/rooms/",
            {"name": "Physics circle", "topic": "Physics"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        created = Room.objects.get(name="Physics circle")
        self.assertTrue(RoomMember.objects.filter(room=created, user=self.host).exists())

    def test_only_host_can_edit_and_delete(self):
        self.client.force_authenticate(user=self.member)
        self.assertEqual(
            self.client.patch(
                f"/api/rooms/{self.room.pk}/", {"name": "Hijacked"}, format="json"
            ).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"/api/rooms/{self.room.pk}/").status_code, 403)

        self.client.force_authenticate(user=self.host)
        response = self.client.patch(
            f"/api/rooms/{self.room.pk}/",
            {"name": "Calculus lab", "topic": "Maths"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            ContentAuditLog.objects.filter(
                action=ContentAuditLog.Action.EDIT, content_type="rooms.room"
            ).exists()
        )

    def test_deleting_room_cascades_room_posts_and_restore_brings_them_back(self):
        post = Post.objects.create(
            author=self.host,
            title="Room-only discussion",
            body="Only us.",
            visibility=Post.Visibility.ROOM_ONLY,
            room=self.room,
        )
        self.client.force_authenticate(user=self.host)
        self.assertEqual(self.client.delete(f"/api/rooms/{self.room.pk}/").status_code, 204)
        self.assertFalse(Room.objects.filter(pk=self.room.pk).exists())
        self.assertFalse(Post.objects.filter(pk=post.pk).exists())

        self.assertEqual(
            self.client.post(f"/api/rooms/{self.room.pk}/restore/").status_code, 200
        )
        self.assertTrue(Post.objects.filter(pk=post.pk).exists())

    def test_chat_requires_joining_and_never_exposes_sender_email(self):
        self.client.force_authenticate(user=self.outsider)
        self.assertEqual(
            self.client.get(f"/api/rooms/{self.room.pk}/messages/").status_code, 403
        )
        self.assertEqual(
            self.client.post(
                f"/api/rooms/{self.room.pk}/messages/",
                {"content": "Sneaking in"},
                format="json",
            ).status_code,
            403,
        )

        joined = self.client.post(f"/api/rooms/{self.room.pk}/join/")
        self.assertIn(joined.status_code, (200, 201))
        created = self.client.post(
            f"/api/rooms/{self.room.pk}/messages/",
            {"content": "Hello everyone"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertNotIn("outsider@example.com", created.content.decode())
        self.assertTrue(
            RoomMessage.objects.filter(room=self.room, sender=self.outsider).exists()
        )

        self.assertIn(
            self.client.get(f"/api/rooms/{self.room.pk}/members/").status_code, (200,)
        )

    def test_non_member_member_list_is_empty(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/rooms/{self.room.pk}/members/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertEqual(rows, [])

    def test_livekit_token_requires_membership_and_configuration(self):
        self.client.force_authenticate(user=self.outsider)
        self.assertEqual(
            self.client.post(f"/api/rooms/{self.room.pk}/livekit-token/").status_code, 403
        )

        self.client.force_authenticate(user=self.member)
        self.assertEqual(
            self.client.post(f"/api/rooms/{self.room.pk}/livekit-token/").status_code, 503
        )

        with override_settings(
            LIVEKIT_URL="wss://livekit.example",
            LIVEKIT_API_KEY="test-key",
            LIVEKIT_API_SECRET="test-secret",
            LIVEKIT_TOKEN_TTL_SECONDS=600,
        ):
            response = self.client.post(f"/api/rooms/{self.room.pk}/livekit-token/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["room"], f"room-{self.room.pk}")
        claims = jwt.decode(body["token"], "test-secret", algorithms=["HS256"])
        self.assertEqual(claims["iss"], "test-key")
        self.assertEqual(claims["video"]["room"], f"room-{self.room.pk}")
        self.assertTrue(claims["video"]["roomJoin"])

    def test_whiteboard_snapshot_and_host_only_clear(self):
        self.room.whiteboard_data = {"strokes": [{"id": "abc", "points": [[0.1, 0.2]]}], "version": 1}
        self.room.save(update_fields=["whiteboard_data"])
        self.client.force_authenticate(user=self.outsider)
        self.assertEqual(
            self.client.get(f"/api/rooms/{self.room.pk}/whiteboard/").status_code, 403
        )

        self.client.force_authenticate(user=self.member)
        snapshot = self.client.get(f"/api/rooms/{self.room.pk}/whiteboard/")
        self.assertEqual(snapshot.status_code, 200)
        self.assertEqual(len(snapshot.json()["strokes"]), 1)
        self.assertEqual(
            self.client.delete(f"/api/rooms/{self.room.pk}/whiteboard/").status_code, 403
        )

        self.client.force_authenticate(user=self.host)
        self.assertEqual(
            self.client.delete(f"/api/rooms/{self.room.pk}/whiteboard/").status_code, 200
        )
        self.room.refresh_from_db()
        self.assertEqual(self.room.whiteboard_data["strokes"], [])

    def test_join_and_leave_are_idempotent_and_host_cannot_leave(self):
        self.client.force_authenticate(user=self.host)
        self.assertEqual(self.client.delete(f"/api/rooms/{self.room.pk}/join/").status_code, 400)
        self.assertEqual(self.client.post(f"/api/rooms/{self.room.pk}/join/").status_code, 200)

        self.client.force_authenticate(user=self.outsider)
        first = self.client.post(f"/api/rooms/{self.room.pk}/join/")
        second = self.client.post(f"/api/rooms/{self.room.pk}/join/")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(self.client.delete(f"/api/rooms/{self.room.pk}/join/").status_code, 200)
