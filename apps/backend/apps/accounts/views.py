import json

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
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
    PublicProfileSerializer,
    PublicUserSerializer,
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
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        profile = request.user.profile
        serializer = ProfileSerializer(
            profile, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        Profile.objects.filter(user=request.user).update(must_change_password=False)
        return Response({"code": "ok", "message": "Password updated."})


class ExportAccountView(APIView):
    """Download everything the signed-in member created (JSON)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.community.models import Comment, Like, Notification, Post
        from apps.organizations.models import OrganizationMembership
        from apps.research.models import ResearchDocument

        user = request.user
        posts = Post.all_objects.filter(author=user).values(
            "id", "title", "body", "subject", "kind", "visibility",
            "review_status", "is_deleted", "created_at", "updated_at",
        )
        comments = Comment.all_objects.filter(author=user).values(
            "id", "post_id", "parent_id", "body", "is_deleted", "created_at", "updated_at",
        )
        research = ResearchDocument.all_objects.filter(owner=user).values(
            "id", "title", "abstract", "body", "field", "status",
            "is_deleted", "created_at", "updated_at",
        )
        payload = {
            "exported_at": timezone.now().isoformat(),
            "account": {
                "id": user.pk,
                "username": user.username,
                "email": user.email,
                "date_joined": user.date_joined.isoformat(),
                "is_moderator": user.is_moderator,
            },
            "profile": ProfileSerializer(
                user.profile, context={"request": request}
            ).data,
            "posts": list(posts),
            "comments": list(comments),
            "likes": list(Like.objects.filter(user=user).values("post_id", "created_at")),
            "follows": {
                "following": list(
                    Follow.objects.filter(follower=user).values("followed__username")
                ),
                "followers": list(
                    Follow.objects.filter(followed=user).values("follower__username")
                ),
            },
            "research_documents": list(research),
            "organizations": list(
                OrganizationMembership.objects.filter(user=user).values(
                    "organization__name", "organization__slug", "role", "status", "joined_at"
                )
            ),
            "notifications": list(
                Notification.objects.filter(user=user).values(
                    "verb", "text", "is_read", "created_at"
                )
            ),
        }
        response = HttpResponse(
            json.dumps(payload, indent=2, default=str),
            content_type="application/json",
        )
        response["Content-Disposition"] = (
            f'attachment; filename="curious-bright-{user.username}.json"'
        )
        return response


class DeleteAccountView(APIView):
    """Permanently delete the signed-in account after password confirmation."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        password = request.data.get("password") or ""
        confirmation = (request.data.get("confirmation") or "").strip()
        if confirmation.lower() != "delete my account":
            return Response(
                {
                    "code": "confirmation_required",
                    "message": 'Type "delete my account" to confirm.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(password):
            return Response(
                {"code": "invalid_password", "message": "Your password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        # Organizations protect their owner from deletion (on_delete=PROTECT).
        # Block early with an actionable message instead of letting the
        # ProtectedError surface as an opaque 500.
        from apps.organizations.models import Organization

        owned = list(
            Organization.objects.filter(owner=user)
            .order_by("name")
            .values_list("name", flat=True)[:3]
        )
        if owned:
            names = ", ".join(owned)
            return Response(
                {
                    "code": "organization_owner",
                    "message": (
                        f"You still own {names}. Transfer ownership to another "
                        "admin or deactivate the organization before deleting "
                        "your account."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        # Notifications, likes, follows and memberships cascade with the user;
        # authored content is intentionally removed with the account.
        user.delete()
        return Response({"code": "ok", "message": "Your account has been deleted."})


class ProfileDetailView(generics.RetrieveAPIView):
    """Public profile of any user by username (never exposes email)."""

    serializer_class = PublicProfileSerializer
    permission_classes = [AllowAny]
    lookup_field = "username"

    def get_object(self):
        user = get_object_or_404(User, username=self.kwargs["username"], is_active=True)
        return user.profile

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["accurate_post_count"] = True
        return context


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
    """Public follower list; uses the PII-safe user shape (never email)."""

    serializer_class = PublicUserSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs["username"])
        # following_set lives on the follower side of the Follow relation.
        return (
            User.objects.filter(following_set__followed=user)
            .select_related("profile")
            .order_by("username")
        )


class FollowingListView(generics.ListAPIView):
    """Public following list; uses the PII-safe user shape (never email)."""

    serializer_class = PublicUserSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs["username"])
        # followers_set lives on the followed side of the Follow relation.
        return (
            User.objects.filter(followers_set__follower=user)
            .select_related("profile")
            .order_by("username")
        )


class IsFollowingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, username):
        target = get_object_or_404(User, username=username)
        following = Follow.objects.filter(follower=request.user, followed=target).exists()
        return Response({"following": following})
