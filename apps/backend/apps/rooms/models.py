from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import SoftDeleteModel


class Room(SoftDeleteModel):
    name = models.CharField(max_length=120)
    topic = models.CharField(max_length=80, default="General Study")
    description = models.TextField(blank=True)
    organization = models.ForeignKey(
        "organizations.Organization",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="rooms",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="rooms_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    whiteboard_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Persisted collaborative whiteboard strokes (v1 snapshot).",
    )

    class Meta:
        ordering = ["-created_at"]
        default_manager_name = "objects"
        base_manager_name = "all_objects"

    def __str__(self):
        return self.name


class RoomMember(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="room_memberships")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["joined_at"]
        constraints = [
            models.UniqueConstraint(fields=["room", "user"], name="unique_room_member"),
        ]

    def __str__(self):
        return f"{self.user.username} in {self.room.name}"


class VideoSession(models.Model):
    """Aggregate-only record of time spent in a room's video call.

    No media, chat, or participant content is stored. Clients start a session
    when they join the LiveKit room, send a heartbeat while connected, and end
    it when they leave. The analytics dashboard sums ``duration_seconds``.
    """

    room = models.ForeignKey(
        Room, on_delete=models.CASCADE, related_name="video_sessions"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="video_sessions",
    )
    joined_at = models.DateTimeField(auto_now_add=True, db_index=True)
    last_heartbeat_at = models.DateTimeField(default=timezone.now)
    left_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-joined_at"]
        indexes = [
            models.Index(fields=["room", "joined_at"]),
            models.Index(fields=["user", "joined_at"]),
            models.Index(fields=["left_at", "last_heartbeat_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} in room {self.room_id} ({self.duration_seconds}s)"


class RoomMessage(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="room_messages"
    )
    content = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender.username}: {self.content[:40]}"
