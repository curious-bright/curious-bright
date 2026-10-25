from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.rooms.models import Room, RoomMember, VideoSession

User = get_user_model()


class VideoSessionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="caller",
            email="caller@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.outsider = User.objects.create_user(
            username="outsider",
            email="outsider@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.room = Room.objects.create(name="Algorithms", created_by=self.user)
        RoomMember.objects.create(room=self.room, user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def start(self):
        return self.client.post(f"/api/rooms/{self.room.pk}/video-sessions/start/")

    def test_member_can_start_heartbeat_and_end_session(self):
        started = self.start()
        self.assertEqual(started.status_code, 201, started.content)
        session_id = started.json()["id"]
        self.assertEqual(started.json()["heartbeat_interval"], 30)

        VideoSession.objects.filter(pk=session_id).update(
            joined_at=timezone.now() - timedelta(seconds=120),
            last_heartbeat_at=timezone.now() - timedelta(seconds=30),
        )
        heartbeat = self.client.post(
            f"/api/rooms/{self.room.pk}/video-sessions/{session_id}/heartbeat/"
        )
        self.assertEqual(heartbeat.status_code, 200, heartbeat.content)
        self.assertGreaterEqual(heartbeat.json()["duration_seconds"], 119)

        ended = self.client.post(
            f"/api/rooms/{self.room.pk}/video-sessions/{session_id}/end/"
        )
        self.assertEqual(ended.status_code, 200, ended.content)
        session = VideoSession.objects.get(pk=session_id)
        self.assertIsNotNone(session.left_at)
        self.assertGreaterEqual(session.duration_seconds, 119)

        # Ending twice is idempotent and does not create another row.
        again = self.client.post(
            f"/api/rooms/{self.room.pk}/video-sessions/{session_id}/end/"
        )
        self.assertEqual(again.status_code, 200)
        self.assertEqual(VideoSession.objects.filter(room=self.room).count(), 1)

    def test_non_member_cannot_start_a_session(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.start()
        self.assertEqual(response.status_code, 403)
        self.assertFalse(VideoSession.objects.filter(room=self.room).exists())

    def test_start_resumes_an_active_session(self):
        first = self.start()
        second = self.start()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertTrue(second.json()["resumed"])

    def test_heartbeat_rejects_another_users_session(self):
        started = self.start()
        session_id = started.json()["id"]
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            f"/api/rooms/{self.room.pk}/video-sessions/{session_id}/heartbeat/"
        )
        self.assertEqual(response.status_code, 404)
