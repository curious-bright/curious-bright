from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import audit_content, changed_fields
from apps.core.models import ContentAuditLog
from apps.core.permissions import IsOwnerOrReadOnly, is_moderator_or_staff
from apps.gamification.services import award_badge
from apps.realtime.broadcast import publish

from .models import Comment, HelpfulReaction, Like, Notification, Post
from .notifications import notify, notify_mentions
from .serializers import (
    CommentSerializer,
    HelpfulReactionSerializer,
    LikeSerializer,
    NotificationSerializer,
    PostCreateSerializer,
    PostDetailSerializer,
    PostListSerializer,
)
from .visibility import can_view_post, post_groups, visible_posts

User = get_user_model()


def _feed_queryset(user):
    return (
        visible_posts(user)
        .select_related("author", "author__profile", "room", "organization")
        .prefetch_related("equations")
        .order_by("-created_at")
    )


class FollowingFeedView(generics.ListAPIView):
    """Posts from people I follow + my own posts (including private ones)."""

    serializer_class = PostListSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Post.objects.none()
        followed_ids = user.following_set.values_list("followed_id", flat=True)
        return _feed_queryset(user).filter(
            Q(author__in=followed_ids) | Q(author=user)
        ).distinct()


class DiscoverFeedView(generics.ListAPIView):
    serializer_class = PostListSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        return _feed_queryset(self.request.user).filter(
            visibility=Post.Visibility.PUBLIC
        )


class PostViewSet(generics.ListCreateAPIView):
    serializer_class = PostCreateSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        qs = _feed_queryset(self.request.user)
        params = self.request.query_params
        subject = params.get("subject")
        if subject:
            qs = qs.filter(subject=subject)
        kind = params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        level = params.get("academic_level")
        if level:
            qs = qs.filter(academic_level=level)
        visibility = params.get("visibility")
        if visibility:
            qs = qs.filter(visibility=visibility)
        if params.get("attachment") == "only":
            qs = qs.exclude(Q(attachment__isnull=True) | Q(attachment=""))
        elif params.get("attachment") == "none":
            qs = qs.filter(Q(attachment__isnull=True) | Q(attachment=""))
        if params.get("status") == "published":
            qs = qs.filter(review_status=Post.ReviewStatus.PUBLISHED)
        author = params.get("author")
        if author:
            qs = qs.filter(author__username=author)
        if params.get("mine") in ("1", "true", "yes") and self.request.user.is_authenticated:
            qs = qs.filter(author=self.request.user)
        room = params.get("room")
        if room and str(room).isdigit():
            qs = qs.filter(room_id=int(room))
        search = params.get("search")
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(body__icontains=search))
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PostCreateSerializer
        return PostListSerializer

    def perform_create(self, serializer):
        post = serializer.save()
        from apps.accounts.models import Profile

        Profile.objects.filter(user=self.request.user).update(
            post_count=Post.objects.filter(author=self.request.user).count()
        )
        audit_content(
            ContentAuditLog.Action.CREATE,
            post,
            self.request.user,
            visibility=post.visibility,
        )
        notify_mentions(post.body, self.request.user, post=post)
        publish(
            post_groups(post),
            "post.created",
            PostListSerializer(post, context={"request": self.request}).data,
        )

    def create(self, request, *args, **kwargs):
        """Respond with the full list shape (review_status/attachment_url...)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(
            PostListSerializer(serializer.instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class PostDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PostDetailSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]
    queryset = Post.objects.select_related(
        "author", "author__profile", "room", "organization"
    ).prefetch_related("equations")

    def get_object(self):
        obj = get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        if not can_view_post(self.request.user, obj):
            raise NotFound(detail="No Post matches the given query.")
        self.check_object_permissions(self.request, obj)
        return obj

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return PostCreateSerializer
        return PostDetailSerializer

    def perform_update(self, serializer):
        before = Post.all_objects.get(pk=serializer.instance.pk)
        post = serializer.save()
        diff = changed_fields(
            before,
            post,
            ["title", "body", "subject", "kind", "academic_level", "visibility", "room_id"],
        )
        if diff:
            post.is_edited = True
            post.edited_at = timezone.now()
            post.save(update_fields=["is_edited", "edited_at", "updated_at"])
            audit_content(
                ContentAuditLog.Action.EDIT,
                post,
                self.request.user,
                changes=diff,
            )
            publish(
                post_groups(post),
                "post.updated",
                PostListSerializer(post, context={"request": self.request}).data,
            )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        expected = request.data.get("expected_updated_at")
        if expected:
            expected_dt = parse_datetime(str(expected))
            if expected_dt is None or abs((instance.updated_at - expected_dt).total_seconds()) > 1:
                return Response(
                    {
                        "code": "conflict",
                        "message": "This post changed elsewhere. Reload it before saving.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(
            PostDetailSerializer(serializer.instance, context={"request": request}).data
        )

    def perform_destroy(self, instance):
        audit_content(ContentAuditLog.Action.DELETE, instance, self.request.user)
        groups = post_groups(instance)
        instance.delete(deleted_by=self.request.user)
        from apps.accounts.models import Profile

        Profile.objects.filter(user=instance.author).update(
            post_count=Post.objects.filter(author=instance.author).count()
        )
        publish(groups | {f"post.{instance.pk}"}, "post.deleted", {"id": instance.pk})


class PostActivityView(generics.ListAPIView):
    """Author-visible edit/delete history for a post."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        post = get_object_or_404(Post.all_objects, pk=pk)
        if post.author_id != request.user.id and not is_moderator_or_staff(request.user):
            return Response(
                {"code": "forbidden", "message": "Only the author can view this history."},
                status=status.HTTP_403_FORBIDDEN,
            )
        rows = ContentAuditLog.objects.filter(
            content_type="community.post", object_id=str(pk)
        ).select_related("actor")[:50]
        return Response(
            [
                {
                    "id": row.pk,
                    "action": row.action,
                    "actor": row.actor.username if row.actor else "system",
                    "reason": row.reason,
                    "metadata": row.metadata,
                    "created_at": row.created_at,
                }
                for row in rows
            ]
        )


class MarkSolvedView(APIView):
    """Questioner confirms a problem as solved -> Solver badge to the
    accepted answer's author, or to the questioner if they solved it alone."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(visible_posts(request.user), pk=pk)
        if post.author != request.user:
            return Response(
                {"code": "forbidden", "message": "Only the post author can mark a post solved."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if post.kind != Post.Kind.QUESTION:
            return Response(
                {"code": "validation_error", "message": "Only questions can be marked solved."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        post.is_solved = True
        post.save(update_fields=["is_solved"])
        publish(f"post.{post.pk}", "post.solved", {"id": post.pk, "is_solved": True})

        accepted = post.comments.filter(is_accepted=True).select_related("author").first()
        if accepted:
            award_badge(accepted.author, "solver", actor=request.user)
            notify(
                accepted.author,
                Notification.VERB.SOLVED,
                actor=request.user,
                text=f"Your answer on '{post.title}' was confirmed solved",
                post=post,
                comment=accepted,
            )
        else:
            award_badge(post.author, "solver", actor=request.user)
        return Response(PostDetailSerializer(post, context={"request": request}).data)


class CommentCreateView(generics.CreateAPIView):
    serializer_class = CommentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Comment.objects.all()

    def perform_create(self, serializer):
        post = get_object_or_404(visible_posts(self.request.user), pk=self.kwargs["pk"])
        parent = None
        parent_id = self.request.data.get("parent")
        if parent_id:
            parent = get_object_or_404(
                Comment, pk=parent_id, post=post, is_deleted=False
            )
        comment = serializer.save(author=self.request.user, post=post, parent=parent)
        Post.objects.filter(pk=post.pk).update(
            comment_count=Comment.objects.filter(post=post).count()
        )
        audit_content(ContentAuditLog.Action.CREATE, comment, self.request.user)
        post.refresh_from_db(fields=["comment_count"])
        publish(
            f"post.{post.pk}",
            "comment.created",
            {
                "comment": CommentSerializer(comment, context={"request": self.request}).data,
                "comment_count": post.comment_count,
            },
        )
        verb = Notification.VERB.REPLY if parent else Notification.VERB.COMMENT
        notify(
            post.author,
            verb,
            actor=self.request.user,
            text=f"@{self.request.user.username} {'replied to you' if parent else 'commented on your post'}",
            post=post,
            comment=comment,
        )
        if parent:
            notify(
                parent.author,
                Notification.VERB.REPLY,
                actor=self.request.user,
                text=f"@{self.request.user.username} replied to your comment",
                post=post,
                comment=comment,
            )
        notify_mentions(comment.body, self.request.user, post=post, comment=comment)


class CommentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CommentSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]

    def get_queryset(self):
        return Comment.objects.filter(post__in=visible_posts(self.request.user)).select_related(
            "author", "author__profile", "post"
        )

    def perform_update(self, serializer):
        before = Comment.all_objects.get(pk=serializer.instance.pk)
        comment = serializer.save()
        if before.body != comment.body:
            comment.is_edited = True
            comment.edited_at = timezone.now()
            comment.save(update_fields=["is_edited", "edited_at", "updated_at"])
            audit_content(
                ContentAuditLog.Action.EDIT,
                comment,
                self.request.user,
                changes={"body": [before.body, comment.body]},
            )
        publish(
            f"post.{comment.post_id}",
            "comment.updated",
            CommentSerializer(comment, context={"request": self.request}).data,
        )

    def perform_destroy(self, instance):
        if not can_view_post(self.request.user, instance.post):
            raise NotFound(detail="No Comment matches the given query.")
        audit_content(ContentAuditLog.Action.DELETE, instance, self.request.user)
        # Replies stay visible under the deleted parent's tombstone so a
        # conversation is not silently removed along with one comment.
        instance.delete(deleted_by=self.request.user)
        count = Comment.objects.filter(post_id=instance.post_id).count()
        Post.all_objects.filter(pk=instance.post_id).update(comment_count=count)
        publish(
            f"post.{instance.post_id}",
            "comment.deleted",
            {"id": instance.pk, "post": instance.post_id, "comment_count": count},
        )


def _can_moderate(user):
    return bool(user.is_authenticated and (user.is_moderator or user.is_staff))


def _restore_check(obj, user, deleted_at):
    if not obj.is_deleted:
        return None
    if obj.author_id != user.id and not _can_moderate(user):
        return Response(
            {"code": "forbidden", "message": "You can only restore your own content."},
            status=status.HTTP_403_FORBIDDEN,
        )
    window = getattr(settings, "SOFT_DELETE_UNDO_SECONDS", 300)
    if not _can_moderate(user) and deleted_at and timezone.now() - deleted_at > timedelta(seconds=window):
        return Response(
            {"code": "restore_window_expired", "message": "The undo window for this item has passed."},
            status=status.HTTP_410_GONE,
        )
    return None


class RestorePostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(Post.all_objects, pk=pk)
        deleted_at = post.deleted_at
        blocked = _restore_check(post, request.user, deleted_at)
        if blocked:
            return blocked
        post.restore()
        # Undo restores the comment cascade created by the same delete action.
        if deleted_at is not None:
            Comment.all_objects.filter(
                post=post, is_deleted=True, deleted_at=deleted_at
            ).update(is_deleted=False, deleted_at=None, deleted_by=None)
        count = Comment.objects.filter(post_id=post.pk).count()
        Post.all_objects.filter(pk=post.pk).update(comment_count=count)
        from apps.accounts.models import Profile

        Profile.objects.filter(user=post.author).update(
            post_count=Post.objects.filter(author=post.author).count()
        )
        audit_content(ContentAuditLog.Action.RESTORE, post, request.user)
        payload = PostListSerializer(post, context={"request": request}).data
        publish(post_groups(post) | {f"post.{post.pk}"}, "post.created", payload)
        return Response(PostDetailSerializer(post, context={"request": request}).data)


class RestoreCommentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        comment = get_object_or_404(Comment.all_objects, pk=pk)
        blocked = _restore_check(comment, request.user, comment.deleted_at)
        if blocked:
            return blocked
        if not can_view_post(request.user, comment.post):
            raise NotFound(detail="No Comment matches the given query.")
        comment.restore()
        count = Comment.objects.filter(post_id=comment.post_id).count()
        Post.all_objects.filter(pk=comment.post_id).update(comment_count=count)
        audit_content(ContentAuditLog.Action.RESTORE, comment, request.user)
        publish(
            f"post.{comment.post_id}",
            "comment.created",
            {
                "comment": CommentSerializer(comment, context={"request": request}).data,
                "comment_count": count,
            },
        )
        return Response(CommentSerializer(comment, context={"request": request}).data)


class ToggleLikeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(visible_posts(request.user), pk=pk)
        like, created = Like.objects.get_or_create(user=request.user, post=post)
        if not created:
            like.delete()
            post.like_count = max(0, post.like_count - 1)
            post.save(update_fields=["like_count"])
            publish(f"post.{post.pk}", "post.like_count", {"id": post.pk, "like_count": post.like_count})
            return Response({"liked": False, "like_count": post.like_count})
        post.like_count += 1
        post.save(update_fields=["like_count"])
        publish(f"post.{post.pk}", "post.like_count", {"id": post.pk, "like_count": post.like_count})
        notify(
            post.author,
            Notification.VERB.LIKE,
            actor=request.user,
            text=f"@{request.user.username} liked '{post.title}'",
            post=post,
        )
        return Response({"liked": True, "like_count": post.like_count}, status=status.HTTP_201_CREATED)


class ToggleHelpfulView(APIView):
    """'This helped me' on a comment -> Teacher badge for the comment author."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        comment = get_object_or_404(
            Comment.objects.select_related("author", "post").filter(
                post__in=visible_posts(request.user)
            ),
            pk=pk,
        )
        reaction, created = HelpfulReaction.objects.get_or_create(user=request.user, comment=comment)
        if not created:
            reaction.delete()
            comment.helpful_count = max(0, comment.helpful_count - 1)
            comment.save(update_fields=["helpful_count"])
            publish(
                f"post.{comment.post_id}",
                "comment.helpful",
                {"id": comment.pk, "helpful_count": comment.helpful_count},
            )
            return Response({"helpful": False, "helpful_count": comment.helpful_count})
        comment.helpful_count += 1
        comment.save(update_fields=["helpful_count"])
        publish(
            f"post.{comment.post_id}",
            "comment.helpful",
            {"id": comment.pk, "helpful_count": comment.helpful_count},
        )
        notify(
            comment.author,
            Notification.VERB.HELPFUL,
            actor=request.user,
            text=f"@{request.user.username} found your answer helpful",
            post=comment.post,
            comment=comment,
        )
        award_badge(comment.author, "teacher", actor=request.user)
        return Response({"helpful": True, "helpful_count": comment.helpful_count}, status=status.HTTP_201_CREATED)


class AcceptAnswerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        comment = get_object_or_404(
            Comment.objects.select_related("author", "post").filter(
                post__in=visible_posts(request.user)
            ),
            pk=pk,
        )
        if comment.post.author != request.user:
            return Response(
                {"code": "forbidden", "message": "Only the post author can accept an answer."},
                status=status.HTTP_403_FORBIDDEN,
            )
        comment.post.comments.filter(is_accepted=True).update(is_accepted=False)
        comment.is_accepted = True
        comment.save(update_fields=["is_accepted"])
        publish(
            f"post.{comment.post_id}",
            "comment.accepted",
            {"id": comment.pk, "post": comment.post_id},
        )
        notify(
            comment.author,
            Notification.VERB.ACCEPTED,
            actor=request.user,
            text=f"Your answer on '{comment.post.title}' was accepted",
            post=comment.post,
            comment=comment,
        )
        award_badge(comment.author, "teacher", actor=request.user)
        return Response(CommentSerializer(comment, context={"request": request}).data)


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).select_related("actor", "actor__profile")


class MarkNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        publish(f"user.{request.user.pk}", "notifications.read", {"updated": updated})
        return Response({"updated": updated})
