from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField(unique=True)
    is_moderator = models.BooleanField(
        default=False,
        help_text="Grants access to the community review queue and reports.",
    )

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    def __str__(self):
        return self.username


class Profile(models.Model):
    class MessagePrivacy(models.TextChoices):
        ANYONE = "anyone", "Anyone"
        FOLLOWS = "follows", "People I follow back"
        NOBODY = "nobody", "Nobody new"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    bio = models.TextField(blank=True, max_length=500)
    avatar = models.URLField(blank=True, max_length=500)
    avatar_file = models.FileField(upload_to="avatars/%Y/%m/", null=True, blank=True)
    subject_expertise = models.CharField(max_length=120, blank=True)
    country = models.CharField(max_length=100, blank=True, default="")
    school = models.CharField(max_length=200, blank=True, default="")
    must_change_password = models.BooleanField(default=False)
    message_privacy = models.CharField(
        max_length=12,
        choices=MessagePrivacy.choices,
        default=MessagePrivacy.ANYONE,
        help_text="Who can start a new private conversation with you.",
    )

    post_count = models.PositiveIntegerField(default=0)
    followers_count = models.PositiveIntegerField(default=0)
    following_count = models.PositiveIntegerField(default=0)
    badge_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile of {self.user.username}"


class Follow(models.Model):
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name="following_set")
    followed = models.ForeignKey(User, on_delete=models.CASCADE, related_name="followers_set")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["follower", "followed"], name="unique_follow_pair"),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("followed")),
                name="no_self_follow",
            ),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.follower.username} -> {self.followed.username}"
