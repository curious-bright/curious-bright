from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.realtime.broadcast import publish

from .models import (
    Conversation,
    ConversationParticipant,
    Message,
    MessageReport,
    UserBlock,
)
from .serializers import (
    ConversationCreateSerializer,
    ConversationSummarySerializer,
    MessageCreateSerializer,
    MessageReportSerializer,
    MessageSerializer,
)
from .services import conversation_for_user, messaging_allowed

User = get_user_model()


def _conversation(request, conversation_id):
    conversation = conversation_for_user(conversation_id, request.user)
    if conversation is None:
        return None
    return conversation


def _summary(conversation, request):
    conversation = Conversation.objects.select_related(
        "user_a__profile", "user_b__profile"
    ).get(pk=conversation.pk)
    return ConversationSummarySerializer(conversation, context={"request": request}).data


def _participant_groups(conversation):
    return [
        f"conversation.{conversation.pk}",
        f"messages.user.{conversation.user_a_id}",
        f"messages.user.{conversation.user_b_id}",
    ]


def _create_message(conversation, sender, body, client_id=None):
    if client_id:
        existing = Message.objects.filter(
            conversation=conversation, sender=sender, client_id=client_id
        ).first()
        if existing:
            return existing, False
    message = Message.objects.create(
        conversation=conversation,
        sender=sender,
        body=body,
        client_id=client_id,
    )
    Conversation.objects.filter(pk=conversation.pk).update(updated_at=timezone.now())
    return message, True


class ConversationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversations = (
            Conversation.objects.filter(participants__user=request.user)
            .select_related("user_a__profile", "user_b__profile")
            .distinct()
            .order_by("-updated_at")[:100]
        )
        return Response(
            ConversationSummarySerializer(
                conversations, many=True, context={"request": request}
            ).data
        )

    def post(self, request):
        serializer = ConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = serializer.validated_data["target"]
        if target.pk == request.user.pk:
            return Response(
                {"code": "validation_error", "message": "Choose another account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = (
            Conversation.objects.filter(
                Q(user_a=request.user, user_b=target)
                | Q(user_a=target, user_b=request.user)
            )
            .select_related("user_a__profile", "user_b__profile")
            .first()
        )
        if existing is None:
            allowed, reason = messaging_allowed(request.user, target)
            if not allowed:
                return Response(
                    {"code": "messaging_not_allowed", "message": reason},
                    status=status.HTTP_403_FORBIDDEN,
                )
            conversation, created = Conversation.between(request.user, target)
            ConversationParticipant.objects.get_or_create(
                conversation=conversation, user=request.user
            )
            ConversationParticipant.objects.get_or_create(
                conversation=conversation, user=target
            )
        else:
            conversation = existing
            created = False

        allowed, reason = messaging_allowed(
            request.user, target, existing=True
        )
        body = serializer.validated_data.get("message")
        if body:
            if not allowed:
                return Response(
                    {"code": "messaging_blocked", "message": reason},
                    status=status.HTTP_403_FORBIDDEN,
                )
            message, message_created = _create_message(conversation, request.user, body)
            if message_created:
                publish(
                    _participant_groups(conversation),
                    "message.created",
                    MessageSerializer(message, context={"request": request}).data,
                )

        return Response(
            _summary(conversation, request),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        conversation = _conversation(request, pk)
        if conversation is None:
            return Response(
                {"code": "not_found", "message": "Conversation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(_summary(conversation, request))


class ConversationMessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        conversation = _conversation(request, pk)
        if conversation is None:
            return Response(
                {"code": "not_found", "message": "Conversation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        qs = conversation.messages.select_related(
            "sender__profile"
        ).order_by("-created_at")
        before = request.query_params.get("before")
        if before and str(before).isdigit():
            qs = qs.filter(pk__lt=int(before))
        limit = min(int(request.query_params.get("limit") or 50), 100)
        rows = list(qs[: limit + 1])
        has_more = len(rows) > limit
        rows = rows[:limit]
        rows.reverse()
        return Response(
            {
                "messages": MessageSerializer(
                    rows, many=True, context={"request": request}
                ).data,
                "has_more": has_more,
            }
        )

    def post(self, request, pk):
        conversation = _conversation(request, pk)
        if conversation is None:
            return Response(
                {"code": "not_found", "message": "Conversation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        other = conversation.other_user(request.user)
        allowed, reason = messaging_allowed(
            request.user, other, existing=True
        )
        if not allowed:
            return Response(
                {"code": "messaging_blocked", "message": reason},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message, created = _create_message(
            conversation,
            request.user,
            serializer.validated_data["body"],
            serializer.validated_data.get("client_id"),
        )
        if created:
            published = MessageSerializer(
                message, context={"request": request}
            ).data
            publish(
                _participant_groups(conversation),
                "message.created",
                published,
            )
            publish(
                [f"messages.user.{other.pk}"],
                "conversation.unread",
                {"conversation_id": conversation.pk},
            )
        return Response(
            MessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ConversationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        conversation = _conversation(request, pk)
        if conversation is None:
            return Response(
                {"code": "not_found", "message": "Conversation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        now = timezone.now()
        updated = conversation.messages.exclude(sender=request.user).filter(
            read_at__isnull=True
        ).update(read_at=now)
        ConversationParticipant.objects.filter(
            conversation=conversation, user=request.user
        ).update(last_read_at=now)
        if updated:
            publish(
                _participant_groups(conversation),
                "message.read",
                {
                    "conversation_id": conversation.pk,
                    "reader_id": request.user.pk,
                    "read_at": now.isoformat(),
                },
            )
        return Response({"read": updated})


class MessageDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        message = get_object_or_404(
            Message.objects.select_related("conversation"), pk=pk
        )
        if not message.conversation.includes(request.user):
            return Response(
                {"code": "not_found", "message": "Message not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if message.sender_id != request.user.pk:
            return Response(
                {"code": "forbidden", "message": "You can only delete your own messages."},
                status=status.HTTP_403_FORBIDDEN,
            )
        message.soft_delete(request.user)
        publish(
            _participant_groups(message.conversation),
            "message.deleted",
            MessageSerializer(message, context={"request": request}).data,
        )
        return Response({"deleted": True})


class MessageReportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        message = get_object_or_404(
            Message.objects.select_related("conversation", "sender"), pk=pk
        )
        if not message.conversation.includes(request.user):
            return Response(
                {"code": "not_found", "message": "Message not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = MessageReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = MessageReport.objects.create(
            message=message,
            reporter=request.user,
            reason=serializer.validated_data["reason"],
        )
        return Response(
            {"id": report.pk, "status": report.status},
            status=status.HTTP_201_CREATED,
        )


class UserBlockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, username):
        target = get_object_or_404(User, username__iexact=username)
        if target.pk == request.user.pk:
            return Response(
                {"code": "validation_error", "message": "You cannot block yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        block, created = UserBlock.objects.get_or_create(
            blocker=request.user, blocked=target
        )
        return Response(
            {"blocked": True, "username": target.username},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, username):
        target = get_object_or_404(User, username__iexact=username)
        UserBlock.objects.filter(blocker=request.user, blocked=target).delete()
        return Response({"blocked": False, "username": target.username})


class BlockListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = UserBlock.objects.filter(blocker=request.user).select_related(
            "blocked__profile"
        )
        return Response(
            [
                {
                    "username": row.blocked.username,
                    "id": row.blocked_id,
                    "blocked_at": row.created_at,
                }
                for row in rows
            ]
        )


class UnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        by_conversation = (
            Message.objects.filter(
                conversation__participants__user=request.user,
                read_at__isnull=True,
            )
            .exclude(sender=request.user)
            .values("conversation_id")
            .annotate(count=Count("id"))
        )
        return Response(
            {
                "total": sum(row["count"] for row in by_conversation),
                "by_conversation": {
                    row["conversation_id"]: row["count"] for row in by_conversation
                },
            }
        )
