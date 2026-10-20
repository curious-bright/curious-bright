from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .auth_serializers import UsernameOrEmailTokenSerializer
from .models import Follow, Profile
from .serializers import (
    ChangePasswordSerializer,
    FollowSerializer,
    ProfileSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


class RateLimitedTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"
    serializer_class = UsernameOrEmailTokenSerializer


class RateLimitedTokenRefreshView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get("refresh")
        if not refresh:
            return Response(
                {"code": "validation_error", "message": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            RefreshToken(refresh).blacklist()
        except Exception:
            pass  # already blacklisted / invalid — logout still succeeds
        return Response({"code": "ok", "message": "Logged out."})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        profile = request.user.profile
        serializer = ProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        return Response({"code": "ok", "message": "Password updated."})


class ProfileDetailView(generics.RetrieveAPIView):
    """Public profile of any user by username."""

    serializer_class = ProfileSerializer
    permission_classes = [AllowAny]
    lookup_field = "username"

    def get_object(self):
        user = get_object_or_404(User, username=self.kwargs["username"])
        return user.profile


class FollowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, username):
        target = get_object_or_404(User, username=username)
        if target == request.user:
            return Response(
                {"code": "validation_error", "message": "You cannot follow yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        follow, created = Follow.objects.get_or_create(follower=request.user, followed=target)
        if not created:
            return Response(
                {"code": "validation_error", "message": "You already follow this user."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.community.models import Notification
        from apps.community.notifications import notify

        notify(
            target,
            Notification.VERB.FOLLOW,
            actor=request.user,
            text=f"@{request.user.username} started following you",
        )
        return Response(FollowSerializer(follow).data, status=status.HTTP_201_CREATED)

    def delete(self, request, username):
        target = get_object_or_404(User, username=username)
        deleted, _ = Follow.objects.filter(follower=request.user, followed=target).delete()
        if not deleted:
            return Response(
                {"code": "not_found", "message": "You do not follow this user."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"code": "ok", "message": "Unfollowed."})


class FollowersListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs["username"])
        return User.objects.filter(followers_set__followed=user).order_by("username")


class FollowingListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs["username"])
        return User.objects.filter(following_set__follower=user).order_by("username")


class IsFollowingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, username):
        target = get_object_or_404(User, username=username)
        following = Follow.objects.filter(follower=request.user, followed=target).exists()
        return Response({"following": following})
