from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ExpoPushToken, WebPushSubscription


class WebSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        endpoint = (request.data.get("endpoint") or "").strip()
        p256dh = (request.data.get("p256dh") or "").strip()
        auth = (request.data.get("auth") or "").strip()
        if not endpoint or not p256dh or not auth:
            return Response(
                {"code": "invalid_subscription", "message": "endpoint, p256dh and auth are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        subscription, _created = WebPushSubscription.objects.update_or_create(
            user=request.user,
            endpoint=endpoint[:4000],
            defaults={"p256dh": p256dh[:1024], "auth": auth[:1024]},
        )
        return Response({"id": subscription.pk}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        endpoint = (request.data.get("endpoint") or "").strip()
        WebPushSubscription.objects.filter(
            user=request.user, endpoint=endpoint[:4000]
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExpoTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = (request.data.get("token") or "").strip()
        platform = (request.data.get("platform") or "").strip().lower()
        if not token or platform not in ExpoPushToken.Platform.values:
            return Response(
                {"code": "invalid_token", "message": "A push token and platform (ios|android) are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        record, _created = ExpoPushToken.objects.update_or_create(
            token=token[:255],
            defaults={"user": request.user, "platform": platform},
        )
        return Response({"id": record.pk}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        token = (request.data.get("token") or "").strip()
        ExpoPushToken.objects.filter(token=token[:255], user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VapidPublicKeyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        key = settings.VAPID_PUBLIC_KEY
        if not key:
            return Response(
                {"code": "push_disabled", "message": "Web push is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"key": key})
