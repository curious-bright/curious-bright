from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

from .models import Room, RoomMember, RoomMessage


class RoomSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Room
        fields = ["id", "name", "topic", "created_by", "member_count", "created_at"]
        read_only_fields = ["created_at"]

    def get_member_count(self, obj):
        if hasattr(obj, "member_count"):
            return obj.member_count
        return obj.memberships.count()


class RoomMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = RoomMember
        fields = ["id", "user", "joined_at"]


class RoomMessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)

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
