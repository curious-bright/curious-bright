from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.realtime.broadcast import publish

from .models import Room, RoomMember, RoomMessage
from .serializers import (
    RoomMemberSerializer,
    RoomMessageCreateSerializer,
    RoomMessageSerializer,
    RoomSerializer,
)


class RoomListCreateView(generics.ListCreateAPIView):
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Room.objects.annotate(member_count=Count("memberships")).select_related("created_by")

    def perform_create(self, serializer):
        room = serializer.save(created_by=self.request.user)
        RoomMember.objects.get_or_create(room=room, user=self.request.user)


class RoomDetailView(generics.RetrieveAPIView):
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated]
    queryset = Room.objects.annotate(member_count=Count("memberships")).select_related("created_by")


class JoinRoomView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        _, created = RoomMember.objects.get_or_create(room=room, user=request.user)
        return Response(
            RoomSerializer(room, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class RoomMembersView(generics.ListAPIView):
    serializer_class = RoomMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        room = get_object_or_404(Room, pk=self.kwargs["pk"])
        return room.memberships.select_related("user", "user__profile")


class RoomMessagesView(generics.ListCreateAPIView):
    """GET: polling endpoint — messages newer than ?after=<id> (or the most
    recent 100 on first load). POST: send a message (joining implicitly)."""

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RoomMessageCreateSerializer
        return RoomMessageSerializer

    def get_room(self):
        return get_object_or_404(Room, pk=self.kwargs["pk"])

    def get_queryset(self):
        room = self.get_room()
        qs = room.messages.select_related("sender", "sender__profile")
        after = self.request.query_params.get("after")
        if after and after.isdigit() and int(after) > 0:
            return qs.filter(id__gt=int(after))
        # First load: the latest slice, returned in chronological order.
        latest_ids = list(qs.order_by("-id").values_list("id", flat=True)[:100])
        return qs.filter(id__in=latest_ids).order_by("id")

    def create(self, request, *args, **kwargs):
        room = self.get_room()
        RoomMember.objects.get_or_create(room=room, user=request.user)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save(room=room, sender=request.user)
        payload = RoomMessageSerializer(message, context={"request": request}).data
        publish(
            f"room.{room.pk}",
            "room.message",
            {
                "id": payload["id"],
                "room": payload["room"],
                "sender": payload["sender"],
                "content": payload["content"],
                "created_at": payload["created_at"],
            },
        )
        return Response(payload, status=status.HTTP_201_CREATED)
