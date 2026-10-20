from django.conf import settings
from django.db import models


class Room(models.Model):
    name = models.CharField(max_length=120)
    topic = models.CharField(max_length=80, default="General Study")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="rooms_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

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
