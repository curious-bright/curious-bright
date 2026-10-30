"""Push delivery for web clients (PWA Web Push) and the Expo mobile app (FCM relay)."""
from django.conf import settings
from django.db import models


class WebPushSubscription(models.Model):
    """One browser subscription. ``endpoint`` is opaque but bounded; browsers
    have been observed under 400 chars, 4000 keeps mistakes out of the DB."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="web_push_subscriptions",
    )
    endpoint = models.CharField(max_length=4000)
    p256dh = models.CharField(max_length=1024)
    auth = models.CharField(max_length=1024)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "endpoint"], name="unique_web_push_subscription"
            )
        ]

    def __str__(self):
        return f"web-push {self.user_id}"


class ExpoPushToken(models.Model):
    """Expo push token relay handle for one device of one user."""

    class Platform(models.TextChoices):
        IOS = "ios", "iOS"
        ANDROID = "android", "Android"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="expo_push_tokens",
    )
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, choices=Platform.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"expo-push {self.user_id} ({self.platform})"
