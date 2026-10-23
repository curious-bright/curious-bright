from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager):
    """Staff/superusers are trusted accounts and never need email verification."""

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_email_verified", True)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    email = models.EmailField(unique=True)
    is_moderator = models.BooleanField(
        default=False,
        help_text="Grants access to the community review queue and reports.",
    )
    is_email_verified = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Public sign-ups must verify their email before they can sign in.",
    )

    objects = UserManager()

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


class EmailVerificationCode(models.Model):
    """A short-lived, hashed six-digit registration verification code."""

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="email_verification_codes"
    )
    email = models.EmailField()
    code_hash = models.CharField(max_length=128)
    request_ip_hash = models.CharField(max_length=64, blank=True, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "consumed_at"]),
            models.Index(fields=["email", "created_at"]),
        ]

    def __str__(self):
        return f"Verification code for {self.email}"


class PasswordResetToken(models.Model):
    """A single-use password reset token; only the SHA-256 hash is stored."""

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="password_reset_tokens"
    )
    token_hash = models.CharField(max_length=64, db_index=True)
    request_ip_hash = models.CharField(max_length=64, blank=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "used_at"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"Password reset token for user {self.user_id}"
