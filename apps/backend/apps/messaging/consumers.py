from channels.db import database_sync_to_async
from django.utils import timezone

from apps.realtime.consumers import BroadcastConsumer


class MessagesConsumer(BroadcastConsumer):
    """Per-user socket for unread counts and conversation-list updates."""

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.user = user
        self.group = f"messages.user.{user.pk}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json(
            {
                "event": "messages.connected",
                "data": {"unread": await self._unread()},
            }
        )

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    @database_sync_to_async
    def _unread(self):
        from .models import Message

        return (
            Message.objects.filter(
                conversation__participants__user=self.user,
                read_at__isnull=True,
            )
            .exclude(sender=self.user)
            .count()
        )


class ConversationConsumer(BroadcastConsumer):
    """Typing/read receipts for one private conversation."""

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.user = user
        self.conversation_id = int(self.scope["url_route"]["kwargs"]["conversation_id"])
        self.group = f"conversation.{self.conversation_id}"
        if not await self._is_participant():
            await self.close(code=4403)
            return
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json(
            {
                "event": "conversation.connected",
                "data": {"conversation": self.conversation_id},
            }
        )

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "typing":
            await self._publish(
                "conversation.typing",
                {
                    "conversation_id": self.conversation_id,
                    "user": {"id": self.user.pk, "username": self.user.username},
                    "is_typing": bool(content.get("is_typing")),
                },
            )
        elif kind == "read":
            read_at = await self._mark_read()
            if read_at:
                await self._publish(
                    "message.read",
                    {
                        "conversation_id": self.conversation_id,
                        "reader_id": self.user.pk,
                        "read_at": read_at.isoformat(),
                    },
                )

    async def _publish(self, event, data):
        await self.channel_layer.group_send(
            self.group, {"type": "broadcast", "event": event, "data": data}
        )

    @database_sync_to_async
    def _is_participant(self):
        from .models import Conversation

        return Conversation.objects.filter(
            pk=self.conversation_id, participants__user=self.user
        ).exists()

    @database_sync_to_async
    def _mark_read(self):
        from .models import Conversation, ConversationParticipant

        conversation = Conversation.objects.filter(
            pk=self.conversation_id, participants__user=self.user
        ).first()
        if conversation is None:
            return None
        now = timezone.now()
        updated = conversation.messages.exclude(sender=self.user).filter(
            read_at__isnull=True
        ).update(read_at=now)
        ConversationParticipant.objects.filter(
            conversation=conversation, user=self.user
        ).update(last_read_at=now)
        return now if updated else None
