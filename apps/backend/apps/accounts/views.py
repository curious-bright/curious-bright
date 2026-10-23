import json

from django.conf import settings
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
    ChangeEmailSerializer,
    ChangePasswordSerializer,
    EmailOnlySerializer,
    FollowSerializer,
    PasswordResetConfirmSerializer,
    ProfileSerializer,
    PublicProfileSerializer,
    PublicUserSerializer,
    RegisterSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)
from .services import (
    confirm_password_reset,
    change_pending_email,
    enforce_verification_send_limits,
    issue_verification_code,
    notify_password_changed,
    request_password_reset,
    resend_verification_code,
    tokens_for_user,
    verify_email_code,
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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Check the per-IP/per-email send limits before creating the account, so
        # a throttled registration does not leave a half-created user behind.
        enforce_verification_send_limits(
            serializer.validated_data["email"].strip().lower(), request
        )
        user = serializer.save()
        _, dispatch = issue_verification_code(
            user, request, enforce_limits=False, wait=False
        )
        return Response(
            {
                "id": user.pk,
                "username": user.username,
                "email": user.email,
                "verification_required": True,
                "code_expires_in": getattr(
                    settings, "EMAIL_VERIFICATION_CODE_TTL_SECONDS", 600
                ),
                "resend_after": getattr(
                    settings, "EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS", 60
                ),
                "email_sent": dispatch.sent,
                "email_queued": dispatch.queued,
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "verify_email"

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = verify_email_code(
            serializer.validated_data["email"],
            serializer.validated_data["code"],
            request,
        )
        payload = tokens_for_user(user)
        payload["user"] = UserSerializer(user, context={"request": request}).data
        return Response(payload)


class ResendVerificationCodeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "resend_code"

    def post(self, request):
        serializer = EmailOnlySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, dispatch = resend_verification_code(
            serializer.validated_data["email"], request
        )
        if dispatch is not None and dispatch.sent is False:
            return Response(
                {
                    "code": "email_delivery_failed",
                    "message": "We couldn't send the email right now. Please try again in a moment.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "code": "ok",
                "message": "If that email is awaiting verification, we sent a new code.",
                "resend_after": getattr(
                    settings, "EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS", 60
                ),
                "email_sent": dispatch.sent if dispatch is not None else None,
            }
        )


class ChangeEmailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "change_email"

    def post(self, request):
        serializer = ChangeEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, dispatch = change_pending_email(
            serializer.validated_data["email"],
            serializer.validated_data["password"],
            serializer.validated_data["new_email"],
            request,
        )
        if dispatch.sent is False:
            return Response(
                {
                    "code": "email_delivery_failed",
                    "message": "Your email was updated, but we couldn't send the code. Please use Resend code.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "code": "ok",
                "message": "Email updated. We sent a new verification code.",
                "email": user.email,
                "resend_after": getattr(
                    settings, "EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS", 60
                ),
                "email_sent": dispatch.sent,
            }
        )


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = EmailOnlySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_password_reset(serializer.validated_data["email"], request)
        # Always the same response, whether or not the email exists.
        return Response(
            {
                "code": "ok",
                "message": "If an account exists for that email, we've sent a password reset link.",
            }
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        confirm_password_reset(
            serializer.validated_data["uid"],
            serializer.validated_data["token"],
            serializer.validated_data["new_password"],
            request,
        )
        return Response(
            {
                "code": "ok",
                "message": "Your password has been reset. You can now sign in.",
            }
        )


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
        # Best-effort security notice; a mail outage must not undo a password change.
        notify_password_changed(request.user, request)
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
