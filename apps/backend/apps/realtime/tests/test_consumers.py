from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.realtime.routing import websocket_urlpatterns
from apps.rooms.models import Room, RoomMember
from config.asgi import JWTAuthMiddleware

User = get_user_model()


def _app():
    return JWTAuthMiddleware(URLRouter(websocket_urlpatterns))


class RealtimeConsumerTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="wsuser", email="ws@example.com", password="Str0ng!Passw0rd99"
        )
        self.room = Room.objects.create(name="Realtime", topic="Testing", created_by=self.user)
        RoomMember.objects.create(room=self.room, user=self.user)
        self.token = str(AccessToken.for_user(self.user))

    async def test_feed_socket_receives_broadcast(self):
        communicator = WebsocketCommunicator(_app(), "/ws/feed/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.receive_json_from()  # connected handshake

        await get_channel_layer().group_send(
            "feed.discover",
            {"type": "broadcast", "event": "post.created", "data": {"id": 99}},
        )
        message = await communicator.receive_json_from()
        self.assertEqual(message["event"], "post.created")
        self.assertEqual(message["data"]["id"], 99)
        await communicator.disconnect()

    async def test_room_socket_creates_and_broadcasts_message(self):
        communicator = WebsocketCommunicator(
            _app(), f"/ws/rooms/{self.room.pk}/?token={self.token}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.receive_json_from()  # room.members

        await communicator.send_json_to({"type": "message", "content": "hello room"})
        message = None
        for _ in range(3):
            candidate = await communicator.receive_json_from()
            if candidate["event"] == "room.message":
                message = candidate
                break
        self.assertIsNotNone(message)
        self.assertEqual(message["data"]["content"], "hello room")
        self.assertEqual(message["data"]["sender"]["username"], "wsuser")
        exists = await database_sync_to_async(
            lambda: self.room.messages.filter(content="hello room").exists()
        )()
        self.assertTrue(exists)
        await communicator.disconnect()

    async def test_room_socket_rejects_non_member(self):
        outsider = await database_sync_to_async(User.objects.create_user)(
            username="outsider", email="out@example.com", password="Str0ng!Passw0rd99"
        )
        token = await database_sync_to_async(lambda: str(AccessToken.for_user(outsider)))()
        communicator = WebsocketCommunicator(
            _app(), f"/ws/rooms/{self.room.pk}/?token={token}"
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_notifications_require_auth(self):
        communicator = WebsocketCommunicator(_app(), "/ws/notifications/")
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()
