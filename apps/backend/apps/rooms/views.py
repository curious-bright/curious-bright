from datetime import timedelta
import json

import jwt
from django.conf import settings
from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.community.models import Post
from apps.community.visibility import post_groups
from apps.core.audit import audit_content, changed_fields
from apps.core.models import ContentAuditLog
from apps.realtime.broadcast import publish

from .livekit import livekit_config
from .models import Room, RoomMember, RoomMessage, VideoSession
from .serializers import (
    RoomMemberSerializer,
    RoomMessageCreateSerializer,
    RoomMessageSerializer,
    RoomSerializer,
    RoomWriteSerializer,
    VideoSessionSerializer,
)


def _can_manage_room(user, room):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_moderator or room.created_by_id == user.id:
        return True
    if room.organization_id:
        return room.organization.memberships.filter(
            user=user,
            role__in=["owner", "admin"],
            status="active",
        ).exists()
    return False


def _require_member(user, room):
    if not user.is_authenticated:
        return False
    return room.memberships.filter(user=user).exists()


class RoomListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Room.objects.annotate(member_count=Count("memberships"))
            .select_related("created_by", "organization")
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        return RoomWriteSerializer if self.request.method == "POST" else RoomSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = serializer.save(created_by=request.user)
        RoomMember.objects.get_or_create(room=room, user=request.user)
        audit_content(ContentAuditLog.Action.CREATE, room, request.user)
        return Response(
            RoomSerializer(room, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class RoomDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Room.objects.annotate(member_count=Count("memberships")).select_related(
        "created_by", "organization"
    )

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return RoomWriteSerializer
        return RoomSerializer

    def update(self, request, *args, **kwargs):
        room = self.get_object()
        if not _can_manage_room(request.user, room):
            return Response(
                {"code": "forbidden", "message": "Only the room host can edit this room."},
                status=status.HTTP_403_FORBIDDEN,
            )
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(room, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        before = Room.all_objects.get(pk=room.pk)
        serializer.save()
        diff = changed_fields(before, room, ["name", "topic", "description", "organization_id"])
        if diff:
            audit_content(
                ContentAuditLog.Action.EDIT, room, request.user, changes=diff
            )
            publish(f"room.{room.pk}", "room.updated", RoomSerializer(room, context={"request": request}).data)
        return Response(RoomSerializer(room, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        room = self.get_object()
        if not _can_manage_room(request.user, room):
            return Response(
                {"code": "forbidden", "message": "Only the room host can delete this room."},
                status=status.HTTP_403_FORBIDDEN,
            )
        audit_content(ContentAuditLog.Action.DELETE, room, request.user)
        # Room-only discussions belong to the room; removing the room also
        # soft-deletes its posts (and their comments) so they cannot resurface.
        for post in Post.objects.filter(room=room):
            groups = post_groups(post)
            post.delete(deleted_by=request.user)
            publish(groups | {f"post.{post.pk}"}, "post.deleted", {"id": post.pk})
        publish(f"room.{room.pk}", "room.deleted", {"id": room.pk})
        room.delete(deleted_by=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RestoreRoomView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(Room.all_objects, pk=pk)
        if not room.is_deleted:
            return Response(
                {"code": "validation_error", "message": "This room is not deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not _can_manage_room(request.user, room):
            return Response(
                {"code": "forbidden", "message": "Only the room host can restore this room."},
                status=status.HTTP_403_FORBIDDEN,
            )
        window = getattr(settings, "SOFT_DELETE_UNDO_SECONDS", 300)
        if (
            not (request.user.is_staff or request.user.is_moderator)
            and room.deleted_at
            and timezone.now() - room.deleted_at > timedelta(seconds=window)
        ):
            return Response(
                {"code": "restore_window_expired", "message": "The undo window for this room has passed."},
                status=status.HTTP_410_GONE,
            )
        cascade_cutoff = (room.deleted_at or timezone.now()) - timedelta(seconds=15)
        room.restore()
        # Undo also restores posts deleted in the same cascade (not unrelated
        # posts the author had already removed beforehand).
        Post.all_objects.filter(
            room=room, is_deleted=True, deleted_at__gte=cascade_cutoff
        ).update(is_deleted=False, deleted_at=None, deleted_by=None)
        audit_content(ContentAuditLog.Action.RESTORE, room, request.user)
        return Response(RoomSerializer(room, context={"request": request}).data)


class JoinRoomView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        _, created = RoomMember.objects.get_or_create(room=room, user=request.user)
        return Response(
            RoomSerializer(room, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        if room.created_by_id == request.user.id:
            return Response(
                {"code": "validation_error", "message": "The host cannot leave their own room. Delete it instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted, _ = RoomMember.objects.filter(room=room, user=request.user).delete()
        if not deleted:
            return Response(
                {"code": "not_found", "message": "You are not a member of this room."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"code": "ok", "message": "You left the study room."})


class VideoSessionStartView(APIView):
    """Start (or resume) an aggregate-only video-call timer."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "video_session"

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        if not _require_member(request.user, room):
            return Response(
                {"code": "forbidden", "message": "Join the room before starting a call."},
                status=status.HTTP_403_FORBIDDEN,
            )
        now = timezone.now()
        active = (
            VideoSession.objects.filter(
                room=room, user=request.user, left_at__isnull=True
            )
            .order_by("-joined_at")
            .first()
        )
        if active and (now - active.last_heartbeat_at).total_seconds() <= 120:
            return Response(
                {
                    **VideoSessionSerializer(active).data,
                    "resumed": True,
                    "heartbeat_interval": 30,
                }
            )
        if active:
            active.left_at = active.last_heartbeat_at
            active.duration_seconds = max(
                0,
                min(
                    int((active.last_heartbeat_at - active.joined_at).total_seconds()),
                    8 * 60 * 60,
                ),
            )
            active.save(update_fields=["left_at", "duration_seconds"])
        session = VideoSession.objects.create(room=room, user=request.user)
        return Response(
            {
                **VideoSessionSerializer(session).data,
                "resumed": False,
                "heartbeat_interval": 30,
            },
            status=status.HTTP_201_CREATED,
        )


class VideoSessionHeartbeatView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "video_session"

    def post(self, request, pk, session_id):
        room = get_object_or_404(Room, pk=pk)
        session = get_object_or_404(
            VideoSession, pk=session_id, room=room, user=request.user
        )
        if session.left_at is not None:
            return Response(
                {"code": "session_ended", "message": "This video session has ended."},
                status=status.HTTP_409_CONFLICT,
            )
        now = timezone.now()
        session.last_heartbeat_at = now
        session.duration_seconds = max(
            0,
            min(
                int((now - session.joined_at).total_seconds()),
                8 * 60 * 60,
            ),
        )
        session.save(update_fields=["last_heartbeat_at", "duration_seconds"])
        return Response(VideoSessionSerializer(session).data)


class VideoSessionEndView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "video_session"

    def post(self, request, pk, session_id):
        room = get_object_or_404(Room, pk=pk)
        session = get_object_or_404(
            VideoSession, pk=session_id, room=room, user=request.user
        )
        if session.left_at is None:
            now = timezone.now()
            session.left_at = now
            session.last_heartbeat_at = now
            session.duration_seconds = max(
                0,
                min(
                    int((now - session.joined_at).total_seconds()),
                    8 * 60 * 60,
                ),
            )
            session.save(
                update_fields=[
                    "left_at",
                    "last_heartbeat_at",
                    "duration_seconds",
                ]
            )
        return Response(VideoSessionSerializer(session).data)


class RoomMembersView(generics.ListAPIView):
    serializer_class = RoomMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        room = get_object_or_404(Room, pk=self.kwargs["pk"])
        if not _require_member(self.request.user, room):
            return RoomMember.objects.none()
        return room.memberships.select_related("user", "user__profile")


class RoomMessagesView(generics.ListCreateAPIView):
    """Members-only chat. Join the room first through ``/rooms/<id>/join/``."""

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RoomMessageCreateSerializer
        return RoomMessageSerializer

    def get_room(self):
        room = get_object_or_404(Room, pk=self.kwargs["pk"])
        if not _require_member(self.request.user, room):
            raise PermissionError
        return room

    def get_queryset(self):
        room = self.get_room()
        qs = room.messages.select_related("sender", "sender__profile")
        after = self.request.query_params.get("after")
        if after and after.isdigit() and int(after) > 0:
            return qs.filter(id__gt=int(after))
        latest_ids = list(qs.order_by("-id").values_list("id", flat=True)[:100])
        return qs.filter(id__in=latest_ids).order_by("id")

    def create(self, request, *args, **kwargs):
        room = self.get_room()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save(room=room, sender=request.user)
        payload = RoomMessageSerializer(message, context={"request": request}).data
        publish(f"room.{room.pk}", "room.message", payload)
        return Response(payload, status=status.HTTP_201_CREATED)

    def handle_exception(self, exc):
        if isinstance(exc, PermissionError):
            return Response(
                {"code": "forbidden", "message": "Join the room before reading or sending messages."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().handle_exception(exc)


class LiveKitConfigView(APIView):
    """Public, secret-free LiveKit availability for the global alert."""

    permission_classes = []

    def get(self, request):
        config = livekit_config()
        return Response(
            {
                "configured": config["configured"],
                "url": config["url"],
                "missing": config["missing"],
            }
        )


class LiveKitTokenView(APIView):
    """Mint a short-lived LiveKit access token for a room member.

    The browser only receives the token and public ws URL; ``LIVEKIT_API_SECRET``
    stays on the server. LiveKit expects ``metadata`` to be a JSON-encoded
    string, not a JSON object.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        if not _require_member(request.user, room):
            return Response(
                {"code": "forbidden", "message": "Join the room before starting a call."},
                status=status.HTTP_403_FORBIDDEN,
            )
        config = livekit_config()
        if not config["configured"]:
            return Response(
                {
                    "code": "livekit_not_configured",
                    "message": "Live video is not configured on this deployment yet.",
                    "missing": config["missing"],
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        profile = getattr(request.user, "profile", None)
        avatar = ""
        if profile is not None:
            avatar = profile.avatar or ""
            if not avatar and profile.avatar_file:
                try:
                    avatar = profile.avatar_file.url
                except ValueError:
                    avatar = ""
        if avatar and avatar.startswith("/"):
            avatar = request.build_absolute_uri(avatar)

        now = int(timezone.now().timestamp())
        ttl = int(getattr(settings, "LIVEKIT_TOKEN_TTL_SECONDS", 7200))
        metadata = json.dumps(
            {
                "userId": request.user.pk,
                "username": request.user.username,
                "avatar": avatar,
            },
            separators=(",", ":"),
        )
        claims = {
            "iss": getattr(settings, "LIVEKIT_API_KEY", ""),
            "sub": f"user-{request.user.pk}",
            "name": request.user.username,
            "nbf": now - 5,
            "exp": now + ttl,
            "metadata": metadata,
            "video": {
                "room": f"room-{room.pk}",
                "roomJoin": True,
                "canPublish": True,
                "canSubscribe": True,
                "canPublishData": True,
            },
        }
        token = jwt.encode(
            claims,
            getattr(settings, "LIVEKIT_API_SECRET", ""),
            algorithm="HS256",
        )
        return Response(
            {
                "token": token,
                "url": config["url"],
                "room": f"room-{room.pk}",
                "identity": f"user-{request.user.pk}",
                "expires_in": ttl,
                "metadata": json.loads(metadata),
            }
        )


class WhiteboardStateView(APIView):
    """HTTP snapshot fallback for clients that reconnect or disable WebSockets."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        if not _require_member(request.user, room):
            return Response(
                {"code": "forbidden", "message": "Join the room to view the whiteboard."},
                status=status.HTTP_403_FORBIDDEN,
            )
        data = room.whiteboard_data or {}
        return Response(
            {
                "room": room.pk,
                "strokes": data.get("strokes", []),
                "version": data.get("version", 0),
                "can_draw": True,
            }
        )

    def delete(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        if not _require_member(request.user, room):
            return Response(
                {"code": "forbidden", "message": "Join the room to clear the whiteboard."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Match the websocket rule: clearing the shared canvas is a host action,
        # not something any participant can do accidentally.
        if not _can_manage_room(request.user, room):
            return Response(
                {"code": "forbidden", "message": "Only the room host can clear the whiteboard."},
                status=status.HTTP_403_FORBIDDEN,
            )
        with transaction.atomic():
            room = Room.all_objects.select_for_update().get(pk=pk)
            room.whiteboard_data = {"strokes": [], "version": timezone.now().timestamp()}
            room.save(update_fields=["whiteboard_data", "updated_at"])
        publish(
            f"whiteboard.{room.pk}",
            "whiteboard.cleared",
            {"room": room.pk, "actor": request.user.username},
        )
        return Response({"code": "ok", "message": "Whiteboard cleared."})
