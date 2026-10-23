from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer

from .models import Conversation, Message, MessageReport, UserBlock
from .services import messaging_allowed

User = get_user_model()


class MessageSerializer(serializers.ModelSerializer):
    sender = PublicUserSerializer(read_only=True)
    deleted = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "body",
            "client_id",
            "created_at",
            "read_at",
            "deleted_at",
            "deleted",
        ]
        read_only_fields = [
            "id",
            "conversation",
            "sender",
            "created_at",
            "read_at",
            "deleted_at",
            "deleted",
        ]

    def get_deleted(self, obj):
        return obj.deleted_at is not None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.deleted_at is not None:
            data["body"] = ""
        return data


class ConversationSummarySerializer(serializers.ModelSerializer):
    other_user = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    is_blocked = serializers.SerializerMethodField()
    blocked_by_me = serializers.SerializerMethodField()
    blocked_by_other = serializers.SerializerMethodField()
    can_send = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "other_user",
            "last_message",
            "unread_count",
            "is_blocked",
            "blocked_by_me",
            "blocked_by_other",
            "can_send",
            "created_at",
            "updated_at",
        ]

    def _me(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def get_other_user(self, obj):
        me = self._me()
        if not me:
            return None
        other = obj.other_user(me)
        return PublicUserSerializer(other, context=self.context).data

    def get_last_message(self, obj):
        prefetched = getattr(obj, "recent_messages", None)
        message = prefetched[0] if prefetched else obj.messages.order_by("-created_at").first()
        if message is None:
            return None
        data = MessageSerializer(message, context=self.context).data
        if not data["deleted"] and len(data["body"]) > 160:
            data["body"] = f"{data['body'][:157]}..."
        return data

    def get_unread_count(self, obj):
        me = self._me()
        if not me:
            return 0
        return obj.messages.exclude(sender=me).filter(read_at__isnull=True).count()

    def get_is_blocked(self, obj):
        me = self._me()
        if not me:
            return False
        return UserBlock.either_direction(me, obj.other_user(me))

    def get_blocked_by_me(self, obj):
        me = self._me()
        if not me:
            return False
        return UserBlock.objects.filter(blocker=me, blocked=obj.other_user(me)).exists()

    def get_blocked_by_other(self, obj):
        me = self._me()
        if not me:
            return False
        return UserBlock.objects.filter(blocker=obj.other_user(me), blocked=me).exists()

    def get_can_send(self, obj):
        me = self._me()
        if not me:
            return False
        allowed, _ = messaging_allowed(me, obj.other_user(me), existing=True)
        return allowed


class ConversationCreateSerializer(serializers.Serializer):
    username = serializers.CharField(required=False, allow_blank=True)
    user_id = serializers.IntegerField(required=False)
    message = serializers.CharField(
        max_length=4000, required=False, allow_blank=True
    )

    def validate(self, attrs):
        username = (attrs.get("username") or "").strip().lstrip("@")
        user_id = attrs.get("user_id")
        if not username and not user_id:
            raise serializers.ValidationError("Provide a username or user_id.")
        target = None
        if user_id:
            target = User.objects.filter(pk=user_id, is_active=True).first()
        elif username:
            target = User.objects.filter(username__iexact=username, is_active=True).first()
        if target is None:
            raise serializers.ValidationError({"username": "No account matches that username."})
        attrs["target"] = target
        attrs["message"] = (attrs.get("message") or "").strip()
        return attrs


class MessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)
    client_id = serializers.UUIDField(required=False)

    def validate_body(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Write a message first.")
        return value


class MessageReportSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)

    def validate_reason(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Tell us what is wrong with this message.")
        return value


class MessageReportRowSerializer(serializers.ModelSerializer):
    message = MessageSerializer(read_only=True)
    reporter = PublicUserSerializer(read_only=True)

    class Meta:
        model = MessageReport
        fields = [
            "id",
            "message",
            "reporter",
            "reason",
            "status",
            "reviewed_by",
            "reviewed_at",
            "created_at",
        ]
        read_only_fields = fields
