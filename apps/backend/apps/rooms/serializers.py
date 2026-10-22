from django.conf import settings
from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer

from .models import Room, RoomMember, RoomMessage


class RoomSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    created_by = serializers.StringRelatedField(read_only=True)
    is_member = serializers.SerializerMethodField()
    mine = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True, default=None)
    livekit_enabled = serializers.SerializerMethodField()
    whiteboard_strokes = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id", "name", "topic", "description", "organization",
            "organization_name", "created_by", "member_count", "is_member",
            "mine", "can_edit", "livekit_enabled", "whiteboard_strokes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "created_by"]

    def _user(self):
        request = self.context.get("request")
        return request.user if request and request.user.is_authenticated else None

    def get_member_count(self, obj):
        if hasattr(obj, "member_count"):
            return obj.member_count
        return obj.memberships.count()

    def get_is_member(self, obj):
        user = self._user()
        return bool(user and obj.memberships.filter(user=user).exists())

    def get_mine(self, obj):
        user = self._user()
        return bool(user and obj.created_by_id == user.id)

    def get_can_edit(self, obj):
        user = self._user()
        if not user:
            return False
        if obj.created_by_id == user.id or user.is_staff or user.is_moderator:
            return True
        if obj.organization_id:
            return obj.organization.memberships.filter(
                user=user, role__in=["owner", "admin"], status="active"
            ).exists()
        return False

    def get_livekit_enabled(self, obj):
        return bool(
            getattr(settings, "LIVEKIT_URL", "")
            and getattr(settings, "LIVEKIT_API_KEY", "")
            and getattr(settings, "LIVEKIT_API_SECRET", "")
        )

    def get_whiteboard_strokes(self, obj):
        return len(((obj.whiteboard_data or {}).get("strokes")) or [])


class RoomWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["name", "topic", "description", "organization"]

    def validate_organization(self, organization):
        request = self.context.get("request")
        if organization and request:
            if not organization.memberships.filter(
                user=request.user, status="active"
            ).exists():
                raise serializers.ValidationError(
                    "You must be an active member of that organization."
                )
        return organization


class RoomMemberSerializer(serializers.ModelSerializer):
    user = PublicUserSerializer(read_only=True)

    class Meta:
        model = RoomMember
        fields = ["id", "user", "joined_at"]


class RoomMessageSerializer(serializers.ModelSerializer):
    sender = PublicUserSerializer(read_only=True)

    class Meta:
        model = RoomMessage
        fields = ["id", "room", "sender", "content", "created_at"]


class RoomMessageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomMessage
        fields = ["id", "content"]

    def validate_content(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Message cannot be empty.")
        return value
