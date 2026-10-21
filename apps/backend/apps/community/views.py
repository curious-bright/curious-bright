from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsOwnerOrReadOnly
from apps.gamification.services import award_badge
from apps.realtime.broadcast import publish
from apps.realtime.feed import feed_groups

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

User = get_user_model()


class FollowingFeedView(generics.ListAPIView):
    """Posts from people I follow + my own posts."""

    serializer_class = PostListSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Post.objects.none()
        followed_ids = user.following_set.values_list("followed_id", flat=True)
        return (
            Post.objects.filter(Q(author__in=followed_ids) | Q(author=user))
            .filter(review_status=Post.ReviewStatus.PUBLISHED)
            .select_related("author", "author__profile")
            .prefetch_related("equations")
        )


class DiscoverFeedView(generics.ListAPIView):
    serializer_class = PostListSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    queryset = (
        Post.objects.filter(review_status=Post.ReviewStatus.PUBLISHED)
        .select_related("author", "author__profile")
        .prefetch_related("equations")
        .order_by("-created_at")
    )


def visible_posts(user):
    """Published posts for everyone; authors additionally see their own
    pending/rejected submissions (moderators inspect those via the queue)."""
    base = Q(review_status=Post.ReviewStatus.PUBLISHED)
    if user.is_authenticated:
        base |= Q(author=user)
    return Post.objects.filter(base)


class PostViewSet(generics.ListCreateAPIView):
    serializer_class = PostCreateSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        qs = (
            visible_posts(self.request.user)
            .select_related("author", "author__profile")
            .prefetch_related("equations")
            .order_by("-created_at")
        )
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
        if params.get("attachment") == "only":
            qs = qs.exclude(Q(attachment__isnull=True) | Q(attachment=""))
        elif params.get("attachment") == "none":
            qs = qs.filter(Q(attachment__isnull=True) | Q(attachment=""))
        if params.get("status") == "published":
            qs = qs.filter(review_status=Post.ReviewStatus.PUBLISHED)
        author = params.get("author")
        if author:
            qs = qs.filter(author__username=author)
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
        notify_mentions(post.body, self.request.user, post=post)
        publish(
            feed_groups(post.author),
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
    queryset = Post.objects.select_related("author", "author__profile").prefetch_related("equations")

    def get_object(self):
        obj = super().get_object()
        user = self.request.user
        is_moderator = bool(user.is_authenticated and (user.is_moderator or user.is_staff))
        if obj.review_status != Post.ReviewStatus.PUBLISHED and not (
            is_moderator or (user.is_authenticated and obj.author == user)
        ):
            from rest_framework.exceptions import NotFound

            raise NotFound(detail="No Post matches the given query.")
        return obj

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return PostCreateSerializer
        return PostDetailSerializer

    def perform_update(self, serializer):
        post = serializer.save()
        publish(
            set(feed_groups(post.author)) | {f"post.{post.pk}"},
            "post.updated",
            PostListSerializer(post, context={"request": self.request}).data,
        )

    def perform_destroy(self, instance):
        instance.delete(deleted_by=self.request.user)
        from apps.accounts.models import Profile

        Profile.objects.filter(user=instance.author).update(
            post_count=Post.objects.filter(author=instance.author).count()
        )
        publish(
            set(feed_groups(instance.author)) | {f"post.{instance.pk}"},
            "post.deleted",
            {"id": instance.pk},
        )


class MarkSolvedView(APIView):
    """Questioner confirms a problem as solved -> Solver badge to the
    accepted answer's author, or to the questioner if they solved it alone."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
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
        post = get_object_or_404(Post, pk=self.kwargs["pk"])
        parent = None
        if self.request.data.get("parent"):
            parent = get_object_or_404(Comment, pk=self.request.data["parent"])
        comment = serializer.save(author=self.request.user, post=post, parent=parent)
        Post.objects.filter(pk=post.pk).update(comment_count=post.comment_count + 1)
        publish(
            f"post.{post.pk}",
            "comment.created",
            {
                "comment": CommentSerializer(comment, context={"request": self.request}).data,
                "comment_count": post.comment_count + 1,
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
    queryset = Comment.objects.all()

    def perform_update(self, serializer):
        comment = serializer.save()
        publish(
            f"post.{comment.post_id}",
            "comment.updated",
            CommentSerializer(comment, context={"request": self.request}).data,
        )

    def perform_destroy(self, instance):
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
        blocked = _restore_check(post, request.user, post.deleted_at)
        if blocked:
            return blocked
        post.restore()
        from apps.accounts.models import Profile

        Profile.objects.filter(user=post.author).update(
            post_count=Post.objects.filter(author=post.author).count()
        )
        payload = PostListSerializer(post, context={"request": request}).data
        publish(set(feed_groups(post.author)) | {f"post.{post.pk}"}, "post.created", payload)
        return Response(PostDetailSerializer(post, context={"request": request}).data)


class RestoreCommentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        comment = get_object_or_404(Comment.all_objects, pk=pk)
        blocked = _restore_check(comment, request.user, comment.deleted_at)
        if blocked:
            return blocked
        comment.restore()
        count = Comment.objects.filter(post_id=comment.post_id).count()
        Post.all_objects.filter(pk=comment.post_id).update(comment_count=count)
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
        post = get_object_or_404(Post, pk=pk)
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
        comment = get_object_or_404(Comment.objects.select_related("author", "post"), pk=pk)
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
        comment = get_object_or_404(Comment.objects.select_related("author", "post"), pk=pk)
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
        return Notification.objects.filter(user=self.request.user).select_related("actor")


class MarkNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        publish(f"user.{request.user.pk}", "notifications.read", {"updated": updated})
        return Response({"updated": updated})
