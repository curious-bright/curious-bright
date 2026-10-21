from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.shortcuts import get_object_or_404

from apps.accounts.serializers import UserSerializer
from apps.rooms.models import Room, RoomMember, RoomMessage
from apps.rooms.serializers import RoomMessageSerializer


def _user_payload(user):
    return {"id": user.pk, "username": user.username}


class BroadcastConsumer(AsyncJsonWebsocketConsumer):
    """Shared handler for channel-layer events (``type`` is always broadcast)."""

    async def broadcast(self, message):
        await self.send_json({"event": message["event"], "data": message["data"]})


class FeedConsumer(BroadcastConsumer):
    async def connect(self):
        user = self.scope.get("user")
        self.groups = ["feed.discover"]
        if user and user.is_authenticated:
            self.groups.append(f"feed.user.{user.pk}")
        for group in self.groups:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "data": {"channels": self.groups}})

    async def disconnect(self, code):
        for group in getattr(self, "groups", []):
            await self.channel_layer.group_discard(group, self.channel_name)


class PostConsumer(BroadcastConsumer):
    async def connect(self):
        self.group = f"post.{self.scope['url_route']['kwargs']['post_id']}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "data": {"channel": self.group}})

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)


class NotificationConsumer(BroadcastConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.group = f"user.{user.pk}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "data": {"channel": self.group}})

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)


class RoomConsumer(BroadcastConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.user = user
        self.room_id = int(self.scope["url_route"]["kwargs"]["room_id"])
        room = await self._get_room()
        if room is None:
            await self.close(code=4404)
            return
        if not await self._is_member():
            await self.close(code=4403)
            return
        self.group = f"room.{self.room_id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json(
            {
                "event": "room.members",
                "data": {"room": self.room_id, "members": await self._members()},
            }
        )
        await self._publish("room.presence", {"action": "joined", "user": _user_payload(user)})

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)
            if code != 4401:
                await self._publish(
                    "room.presence", {"action": "left", "user": _user_payload(self.user)}
                )

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "message":
            body = str(content.get("content") or "").strip()
            if not body or len(body) > 2000:
                return
            message = await self._create_message(body)
            await self._publish("room.message", message)
        elif kind == "typing":
            await self._publish(
                "room.typing",
                {"user": _user_payload(self.user), "is_typing": bool(content.get("is_typing"))},
            )

    async def _publish(self, event, data):
        await self.channel_layer.group_send(
            self.group, {"type": "broadcast", "event": event, "data": data}
        )

    @database_sync_to_async
    def _get_room(self):
        return Room.objects.filter(pk=self.room_id).first()

    @database_sync_to_async
    def _is_member(self):
        return RoomMember.objects.filter(room_id=self.room_id, user=self.user).exists()

    @database_sync_to_async
    def _members(self):
        rows = RoomMember.objects.filter(room_id=self.room_id).select_related("user")
        return [_user_payload(row.user) for row in rows]

    @database_sync_to_async
    def _create_message(self, body):
        message = RoomMessage.objects.create(room_id=self.room_id, sender=self.user, content=body)
        return RoomMessageSerializer(message).data
