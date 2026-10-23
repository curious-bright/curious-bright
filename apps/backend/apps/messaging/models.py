"""One-to-one private messaging.

Conversations are deliberately limited to two people. Every read path is
filtered through ``ConversationParticipant`` so an administrator, moderator or
organization owner can never read another member's messages.
"""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Conversation(models.Model):
    user_a = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations_as_a",
    )
    user_b = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations_as_b",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user_a", "user_b"], name="unique_conversation_pair"
            ),
            models.CheckConstraint(
                condition=~Q(user_a=F("user_b")), name="conversation_distinct_users"
            ),
        ]

    def __str__(self):
        return f"{self.user_a.username} <-> {self.user_b.username}"

    @classmethod
    def between(cls, first, second):
        """Return the canonical conversation pair for two users."""
        if first.pk == second.pk:
            raise ValueError("You cannot start a conversation with yourself.")
        if first.pk < second.pk:
            return cls.objects.get_or_create(user_a=first, user_b=second)
        return cls.objects.get_or_create(user_a=second, user_b=first)

    def other_user(self, user):
        return self.user_b if self.user_a_id == user.pk else self.user_a

    def includes(self, user):
        return user.pk in (self.user_a_id, self.user_b_id)


class ConversationParticipant(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversation_participations",
    )
    last_read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("conversation", "user")
        indexes = [models.Index(fields=["user", "conversation"])]

    def __str__(self):
        return f"{self.user.username} in {self.conversation_id}"


class Message(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_private_messages",
    )
    body = models.TextField(max_length=4000)
    client_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deleted_private_messages",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["conversation", "read_at"]),
        ]

    def __str__(self):
        return f"Message {self.pk} in {self.conversation_id}"

    def soft_delete(self, user):
        if self.sender_id != user.pk:
            raise PermissionError("You can only delete your own messages.")
        if self.deleted_at is not None:
            return self
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.body = ""
        self.save(update_fields=["deleted_at", "deleted_by", "body"])
        return self


class UserBlock(models.Model):
    blocker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocking",
    )
    blocked = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("blocker", "blocked")
        constraints = [
            models.CheckConstraint(
                condition=~Q(blocker=F("blocked")), name="user_block_distinct_users"
            )
        ]

    def __str__(self):
        return f"{self.blocker.username} blocked {self.blocked.username}"

    @classmethod
    def either_direction(cls, first, second):
        return cls.objects.filter(
            Q(blocker=first, blocked=second) | Q(blocker=second, blocked=first)
        ).exists()


class MessageReport(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        REVIEWED = "reviewed", "Reviewed"
        DISMISSED = "dismissed", "Dismissed"

    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="reports"
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="message_reports",
    )
    reason = models.CharField(max_length=500)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="message_reports_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Report {self.pk} on message {self.message_id}"
