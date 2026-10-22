import time
import uuid

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import transaction
from django.utils import timezone

from apps.community.models import Post
from apps.community.visibility import can_view_post
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
    """Post discussion socket; visibility is checked before joining the group."""

    async def connect(self):
        self.user = self.scope.get("user")
        self.post_id = int(self.scope["url_route"]["kwargs"]["post_id"])
        if not await self._can_view():
            await self.close(code=4404)
            return
        self.group = f"post.{self.post_id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "data": {"channel": self.group}})

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    @database_sync_to_async
    def _can_view(self):
        post = Post.objects.filter(pk=self.post_id).first()
        return bool(post and can_view_post(self.user, post))


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


class WhiteboardConsumer(BroadcastConsumer):
    """Real-time collaborative whiteboard for one study room.

    Strokes arrive as complete paths (not every pointer move) to keep DB writes
    cheap. Live in-progress drawing is relayed as a ``whiteboard.draw`` event
    without persistence. A bounded snapshot is stored in ``Room.whiteboard_data``.
    """

    MAX_STROKES = 2500
    MAX_POINTS = 4000

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
        self.is_host = room.created_by_id == user.pk or user.is_staff or user.is_moderator
        self.group = f"whiteboard.{self.room_id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json(
            {"event": "whiteboard.state", "data": await self._state()}
        )
        await self._broadcast(
            "whiteboard.presence",
            {"action": "joined", "user": _user_payload(user)},
        )

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)
            if code not in (4401, 4403, 4404):
                await self._broadcast(
                    "whiteboard.presence",
                    {"action": "left", "user": _user_payload(self.user)},
                )

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "sync":
            await self.send_json({"event": "whiteboard.state", "data": await self._state()})
            return
        if kind == "draw":
            await self._broadcast(
                "whiteboard.draw",
                {
                    "user": _user_payload(self.user),
                    "stroke": self._sanitize_stroke(content.get("stroke") or {}, persist=False),
                },
            )
            return
        if kind == "stroke":
            stroke = self._sanitize_stroke(content.get("stroke") or {}, persist=True)
            if stroke is None:
                return
            version = await self._append(stroke)
            await self._broadcast(
                "whiteboard.stroke",
                {"stroke": stroke, "version": version, "user": _user_payload(self.user)},
            )
            return
        if kind == "undo":
            removed, version = await self._undo()
            if removed:
                await self._broadcast(
                    "whiteboard.undo",
                    {"id": removed, "version": version, "user": _user_payload(self.user)},
                )
            return
        if kind == "clear":
            if not self.is_host:
                await self.send_json(
                    {
                        "event": "whiteboard.error",
                        "data": {"message": "Only the room host can clear the whiteboard."},
                    }
                )
                return
            version = await self._clear()
            await self._broadcast(
                "whiteboard.cleared",
                {"version": version, "user": _user_payload(self.user)},
            )
            return
        if kind == "cursor":
            await self._broadcast(
                "whiteboard.cursor",
                {
                    "user": _user_payload(self.user),
                    "x": float(content.get("x") or 0),
                    "y": float(content.get("y") or 0),
                    "tool": str(content.get("tool") or "pen")[:20],
                },
            )

    def _sanitize_stroke(self, raw, persist):
        if not isinstance(raw, dict):
            return None
        points = raw.get("points")
        if not isinstance(points, list) or not points:
            return None
        clean = []
        for point in points[: self.MAX_POINTS]:
            if isinstance(point, (list, tuple)) and len(point) >= 2:
                try:
                    clean.append([round(float(point[0]), 2), round(float(point[1]), 2)])
                except (TypeError, ValueError):
                    return None
            elif isinstance(point, dict):
                try:
                    clean.append([round(float(point.get("x")), 2), round(float(point.get("y")), 2)])
                except (TypeError, ValueError):
                    return None
        if not clean:
            return None
        stroke = {
            "id": str(raw.get("id") or uuid.uuid4().hex)[:80],
            "user": self.user.pk,
            "username": self.user.username,
            "color": str(raw.get("color") or "#14141A")[:24],
            "width": max(1, min(40, int(raw.get("width") or 3))),
            "tool": "eraser" if raw.get("tool") == "eraser" else "pen",
            "points": clean,
        }
        if not persist:
            stroke["ephemeral"] = True
        return stroke

    async def _broadcast(self, event, data):
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
    def _state(self):
        room = Room.objects.filter(pk=self.room_id).first()
        data = (room.whiteboard_data if room else {}) or {}
        return {
            "room": self.room_id,
            "strokes": data.get("strokes", []),
            "version": data.get("version", 0),
            "can_clear": self.is_host,
        }

    @database_sync_to_async
    def _append(self, stroke):
        with transaction.atomic():
            room = Room.objects.select_for_update().get(pk=self.room_id)
            data = room.whiteboard_data or {}
            strokes = list(data.get("strokes") or [])
            strokes.append(stroke)
            strokes = strokes[-self.MAX_STROKES :]
            version = time.time()
            room.whiteboard_data = {"strokes": strokes, "version": version}
            room.save(update_fields=["whiteboard_data", "updated_at"])
            return version

    @database_sync_to_async
    def _undo(self):
        with transaction.atomic():
            room = Room.objects.select_for_update().get(pk=self.room_id)
            data = room.whiteboard_data or {}
            strokes = list(data.get("strokes") or [])
            for index in range(len(strokes) - 1, -1, -1):
                if strokes[index].get("user") == self.user.pk:
                    removed = strokes.pop(index)
                    version = time.time()
                    room.whiteboard_data = {"strokes": strokes, "version": version}
                    room.save(update_fields=["whiteboard_data", "updated_at"])
                    return removed.get("id"), version
            return None, data.get("version", 0)

    @database_sync_to_async
    def _clear(self):
        with transaction.atomic():
            room = Room.objects.select_for_update().get(pk=self.room_id)
            version = time.time()
            room.whiteboard_data = {"strokes": [], "version": version}
            room.save(update_fields=["whiteboard_data", "updated_at"])
            return version
