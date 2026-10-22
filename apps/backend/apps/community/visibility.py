"""Single source of truth for who may see a community post."""
from django.db.models import Q

from apps.accounts.models import Follow
from apps.core.permissions import is_moderator_or_staff

from .models import Post


def visible_posts(user, queryset=None, include_deleted=False):
    """Return only the posts ``user`` is allowed to see.

    Visibility rules (enforced server-side, never only in the client):

    * public      — everybody, including anonymous visitors
    * followers   — the author plus people who follow the author
    * room_only   — the author plus members of the attached study room
    * moderator/staff — may inspect all content for moderation
    * unpublished submissions are visible to their author and moderators only

    Soft-deleted content is never listed; restore uses the all-objects manager.
    """
    manager = Post.all_objects if include_deleted else Post.objects
    qs = queryset if queryset is not None else manager.all()
    if not qs.query.is_sliced:
        qs = qs

    if not user or not user.is_authenticated:
        return qs.filter(
            review_status=Post.ReviewStatus.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )

    if is_moderator_or_staff(user):
        return qs

    audience = (
        Q(visibility=Post.Visibility.PUBLIC)
        | Q(author=user)
        | Q(
            visibility=Post.Visibility.FOLLOWERS,
            author__followers_set__follower=user,
        )
        | Q(
            visibility=Post.Visibility.ROOM_ONLY,
            room__memberships__user=user,
        )
    )
    submitted = Q(review_status=Post.ReviewStatus.PUBLISHED) | Q(author=user)
    return qs.filter(audience & submitted).distinct()


def can_view_post(user, post):
    """Object-level form of :func:`visible_posts`."""
    if post is None or post.is_deleted:
        return False
    moderator = bool(user and user.is_authenticated and is_moderator_or_staff(user))
    if post.review_status != Post.ReviewStatus.PUBLISHED and not (
        moderator or (user and user.is_authenticated and post.author_id == user.id)
    ):
        return False
    if moderator or (user and user.is_authenticated and post.author_id == user.id):
        return True
    if post.visibility == Post.Visibility.PUBLIC:
        return True
    if not user or not user.is_authenticated:
        return False
    if post.visibility == Post.Visibility.FOLLOWERS:
        return Follow.objects.filter(follower=user, followed_id=post.author_id).exists()
    if post.visibility == Post.Visibility.ROOM_ONLY:
        return bool(
            post.room_id
            and post.room.memberships.filter(user=user).exists()
        )
    return False


def post_groups(post):
    """Realtime groups that may receive a payload for this post.

    Public posts go to the discover feed; private posts must never leak into
    ``feed.discover``. The author and post room always receive updates.
    """
    groups = {f"post.{post.pk}", f"feed.user.{post.author_id}"}
    if post.review_status == Post.ReviewStatus.PUBLISHED:
        if post.visibility == Post.Visibility.PUBLIC:
            groups.add("feed.discover")
        if post.visibility == Post.Visibility.FOLLOWERS:
            follower_ids = Follow.objects.filter(followed_id=post.author_id).values_list(
                "follower_id", flat=True
            )
            groups.update(f"feed.user.{follower_id}" for follower_id in follower_ids)
        if post.visibility == Post.Visibility.ROOM_ONLY and post.room_id:
            groups.add(f"room.{post.room_id}")
    return groups
