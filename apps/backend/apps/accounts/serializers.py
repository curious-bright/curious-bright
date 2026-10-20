from django.contrib.auth import get_user_model, password_validation
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import Follow, Profile

User = get_user_model()


class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    badges = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "username",
            "email",
            "bio",
            "avatar",
            "subject_expertise",
            "post_count",
            "followers_count",
            "following_count",
            "badge_count",
            "badges",
            "created_at",
        ]
        read_only_fields = ["post_count", "followers_count", "following_count", "badge_count", "created_at"]

    def get_badges(self, obj):
        from apps.gamification.models import UserBadge

        rows = (
            UserBadge.objects.filter(user=obj.user)
            .select_related("badge")
            .order_by("-awarded_at")
        )
        return [
            {"code": ub.badge.code, "name": ub.badge.name, "description": ub.badge.description, "icon": ub.badge.icon, "awarded_at": ub.awarded_at}
            for ub in rows
        ]


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "profile"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[password_validation.validate_password])
    username = serializers.CharField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="That username is already taken.")]
    )
    email = serializers.EmailField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="That email is already registered.")]
    )

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[password_validation.validate_password])

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value


class FollowSerializer(serializers.ModelSerializer):
    follower = serializers.StringRelatedField(read_only=True)
    followed = serializers.StringRelatedField(read_only=True)
    followed_username = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Follow
        fields = ["id", "follower", "followed", "followed_username", "created_at"]
