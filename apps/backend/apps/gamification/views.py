from rest_framework import generics, permissions

from .models import Badge, UserBadge
from .serializers import BadgeSerializer, UserBadgeSerializer


class BadgeListView(generics.ListAPIView):
    serializer_class = BadgeSerializer
    permission_classes = [permissions.AllowAny]
    queryset = Badge.objects.filter(active=True)


class MyBadgesView(generics.ListAPIView):
    serializer_class = UserBadgeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UserBadge.objects.filter(user=self.request.user).select_related("badge")
