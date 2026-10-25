from django.contrib.auth import get_user_model, password_validation
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from apps.core.legal import consent_status

from .models import Follow, Profile

User = get_user_model()


def _absolute_url(request, url):
    if not url:
        return ""
    if request:
        return request.build_absolute_uri(url)
    return url


class PublicProfileSerializer(serializers.ModelSerializer):
    """Profile data safe to show to anonymous visitors (no email)."""

    username = serializers.CharField(source="user.username", read_only=True)
    badges = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    post_count = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "username",
            "bio",
            "avatar",
            "avatar_url",
            "subject_expertise",
            "country",
            "school",
            "post_count",
            "followers_count",
            "following_count",
            "badge_count",
            "badges",
            "created_at",
        ]

    def get_avatar_url(self, obj):
        request = self.context.get("request")
        if obj.avatar_file:
            try:
                return _absolute_url(request, obj.avatar_file.url)
            except ValueError:
                pass
        return obj.avatar or ""

    def get_post_count(self, obj):
        """Count posts the viewer may actually see on this profile.

        The stored counter is kept for admin/list views, but it can drift when
        posts are created before signals run. Profile pages ask for an accurate
        count so the stat strip matches the post list below it.
        """
        if not self.context.get("accurate_post_count"):
            return obj.post_count
        from apps.community.visibility import visible_posts

        request = self.context.get("request")
        user = getattr(request, "user", None)
        return visible_posts(user).filter(author=obj.user).count()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Keep one canonical `avatar` value for legacy components.
        if data.get("avatar_url"):
            data["avatar"] = data["avatar_url"]
        return data

    def get_badges(self, obj):
        from apps.gamification.models import UserBadge

        rows = (
            UserBadge.objects.filter(user=obj.user)
            .select_related("badge")
            .order_by("-awarded_at")
        )
        return [
            {
                "code": ub.badge.code,
                "name": ub.badge.name,
                "description": ub.badge.description,
                "icon": ub.badge.icon,
                "awarded_at": ub.awarded_at,
            }
            for ub in rows
        ]


class ProfileSerializer(PublicProfileSerializer):
    """The signed-in member's editable profile."""

    email = serializers.EmailField(source="user.email", read_only=True)
    avatar_file = serializers.FileField(required=False, allow_null=True, write_only=True)

    class Meta(PublicProfileSerializer.Meta):
        fields = PublicProfileSerializer.Meta.fields + [
            "email",
            "avatar_file",
            "message_privacy",
        ]
        read_only_fields = [
            "post_count",
            "followers_count",
            "following_count",
            "badge_count",
            "created_at",
        ]

    def validate_avatar_file(self, value):
        if value is None:
            return value
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Avatar images must be 5 MB or smaller.")
        allowed = ("image/jpeg", "image/png", "image/webp", "image/gif")
        if getattr(value, "content_type", "") not in allowed:
            raise serializers.ValidationError("Upload a JPEG, PNG, WebP or GIF image.")
        return value


class PublicUserSerializer(serializers.ModelSerializer):
    """Author/user shape used in feeds, comments, rooms and research."""

    profile = PublicProfileSerializer(read_only=True)
    can_moderate = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "profile", "can_moderate"]

    def get_can_moderate(self, obj):
        return bool(obj.is_moderator or obj.is_staff)


class UserSerializer(serializers.ModelSerializer):
    """Private "me" shape. Only ever returned for the authenticated user."""

    profile = ProfileSerializer(read_only=True)
    can_moderate = serializers.SerializerMethodField()
    must_change_password = serializers.SerializerMethodField()
    consent = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "profile",
            "is_moderator",
            "is_email_verified",
            "can_moderate",
            "must_change_password",
            "consent",
        ]

    def get_can_moderate(self, obj):
        return bool(obj.is_moderator or obj.is_staff)

    def get_must_change_password(self, obj):
        profile = getattr(obj, "profile", None)
        return bool(profile and profile.must_change_password)

    def get_consent(self, obj):
        return consent_status(obj)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[password_validation.validate_password])
    username = serializers.CharField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="That username is already taken.")]
    )
    email = serializers.EmailField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="That email is already registered.")]
    )
    accept_terms = serializers.BooleanField(write_only=True)
    accept_privacy = serializers.BooleanField(write_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "accept_terms", "accept_privacy"]

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("That email is already registered.")
        return normalized

    def validate(self, attrs):
        if not attrs.get("accept_terms") or not attrs.get("accept_privacy"):
            raise serializers.ValidationError(
                {
                    "accept_terms": (
                        "You must accept the Terms of Use and Privacy Policy to create an account."
                    )
                }
            )
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"].strip().lower(),
            password=validated_data["password"],
            is_email_verified=False,
        )


class ConsentAcceptSerializer(serializers.Serializer):
    accept_terms = serializers.BooleanField()
    accept_privacy = serializers.BooleanField()

    def validate(self, attrs):
        if not attrs.get("accept_terms") or not attrs.get("accept_privacy"):
            raise serializers.ValidationError(
                "Accept both the Terms of Use and Privacy Policy to continue."
            )
        return attrs


class EmailOnlySerializer(serializers.Serializer):
    email = serializers.EmailField()


class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.RegexField(
        r"^\d{6}$",
        error_messages={"invalid": "Enter the six-digit code from your email."},
    )


class ChangeEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    new_email = serializers.EmailField()

    def validate(self, attrs):
        if attrs["email"].strip().lower() == attrs["new_email"].strip().lower():
            raise serializers.ValidationError("Choose a different email address.")
        return attrs


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[password_validation.validate_password])

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["old_password"] == attrs["new_password"]:
            raise serializers.ValidationError("Choose a password different from your current one.")
        return attrs


class FollowSerializer(serializers.ModelSerializer):
    follower = serializers.StringRelatedField(read_only=True)
    followed = serializers.StringRelatedField(read_only=True)
    followed_username = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Follow
        fields = ["id", "follower", "followed", "followed_username", "created_at"]
