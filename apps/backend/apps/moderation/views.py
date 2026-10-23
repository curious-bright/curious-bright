from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.community.models import Notification, Post
from apps.community.notifications import notify
from apps.community.serializers import PostListSerializer
from apps.community.visibility import post_groups
from apps.realtime.broadcast import publish

from .models import ModeratorApplication, Report
from .permissions import IsModerator
from .serializers import (
    ModeratorApplicationSerializer,
    ReportCreateSerializer,
    ReportSerializer,
)
from .services import notify_application_decision

User = get_user_model()


class FlagPostView(APIView):
    """Any signed-in member can report a post for moderation."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        if post.author == request.user:
            return Response(
                {"code": "validation_error", "message": "You cannot report your own post."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Report.objects.filter(reporter=request.user, post=post).exists():
            return Response(
                {"code": "validation_error", "message": "You have already reported this post."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        Report.objects.create(reporter=request.user, post=post, reason=serializer.validated_data["reason"])
        return Response({"flagged": True}, status=status.HTTP_201_CREATED)


class ModerationQueueView(generics.ListAPIView):
    """Posts waiting for peer review (uploaded papers)."""

    serializer_class = PostListSerializer
    permission_classes = [IsModerator]

    def get_queryset(self):
        return (
            Post.objects.filter(review_status=Post.ReviewStatus.PENDING)
            .select_related("author", "author__profile")
            .prefetch_related("equations")
            .order_by("created_at")
        )


class ApprovePostView(APIView):
    permission_classes = [IsModerator]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk, review_status=Post.ReviewStatus.PENDING)
        post.review_status = Post.ReviewStatus.PUBLISHED
        post.save(update_fields=["review_status"])
        notify(
            post.author,
            Notification.VERB.REVIEW,
            actor=request.user,
            text=f"Your submission '{post.title}' was published to the community",
            post=post,
        )
        publish(
            post_groups(post),
            "post.created",
            PostListSerializer(post, context={"request": request}).data,
        )
        return Response(PostListSerializer(post, context={"request": request}).data)


class RejectPostView(APIView):
    permission_classes = [IsModerator]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk, review_status=Post.ReviewStatus.PENDING)
        post.review_status = Post.ReviewStatus.REJECTED
        post.save(update_fields=["review_status"])
        notify(
            post.author,
            Notification.VERB.REVIEW,
            actor=request.user,
            text=f"Your submission '{post.title}' was not approved for publishing",
            post=post,
        )
        publish(
            post_groups(post),
            "post.updated",
            PostListSerializer(post, context={"request": request}).data,
        )
        return Response(PostListSerializer(post, context={"request": request}).data)


class ReportsListView(generics.ListAPIView):
    serializer_class = ReportSerializer
    permission_classes = [IsModerator]

    def get_queryset(self):
        return Report.objects.filter(is_resolved=False).select_related(
            "reporter", "post", "post__author"
        )


class ResolveReportView(APIView):
    permission_classes = [IsModerator]

    def post(self, request, pk):
        report = get_object_or_404(Report, pk=pk, is_resolved=False)
        report.is_resolved = True
        report.resolved_by = request.user
        report.save(update_fields=["is_resolved", "resolved_by"])
        return Response(ReportSerializer(report, context={"request": request}).data)


class MyApplicationView(APIView):
    """404 -> null for the frontend means 'no application yet'."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        application = ModeratorApplication.objects.filter(user=request.user).first()
        if application is None:
            from rest_framework.exceptions import NotFound

            raise NotFound(detail="No moderator application on file.")
        return Response(ModeratorApplicationSerializer(application, context={"request": request}).data)


class ApplicationListCreateView(generics.ListCreateAPIView):
    serializer_class = ModeratorApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not (self.request.user.is_moderator or self.request.user.is_staff):
            return ModeratorApplication.objects.filter(user=self.request.user)
        return ModeratorApplication.objects.select_related("user", "user__profile").all()

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsModerator()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        if ModeratorApplication.objects.filter(
            user=request.user,
            status__in=[ModeratorApplication.Status.PENDING, ModeratorApplication.Status.APPROVED],
        ).exists():
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"application": ["You already have an application on file."]})
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ApplicationDecisionView(APIView):
    """Moderator/admin approves (grants the role) or declines an application."""

    permission_classes = [IsModerator]

    def post(self, request, pk, decision):
        application = get_object_or_404(ModeratorApplication, pk=pk, status=ModeratorApplication.Status.PENDING)
        note = str(request.data.get("note") or "").strip()[:500]
        if decision == "approve":
            application.status = ModeratorApplication.Status.APPROVED
            application.reviewed_by = request.user
            application.review_note = note
            application.save(
                update_fields=["status", "reviewed_by", "review_note", "updated_at"]
            )
            User.objects.filter(pk=application.user_id).update(is_moderator=True)
            notify_application_decision(application, request.user, True, note)
        elif decision == "decline":
            application.status = ModeratorApplication.Status.REJECTED
            application.reviewed_by = request.user
            application.review_note = note
            application.save(
                update_fields=["status", "reviewed_by", "review_note", "updated_at"]
            )
            notify_application_decision(application, request.user, False, note)
        else:
            return Response(
                {"code": "not_found", "message": "Unknown decision."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(ModeratorApplicationSerializer(application, context={"request": request}).data)
