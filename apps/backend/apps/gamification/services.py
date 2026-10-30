"""Single source of truth for awarding badges.

award_badge(user, code) is idempotent: a user can never hold the same badge
twice (enforced by a unique constraint AND get_or_create here).
"""
from django.contrib.auth import get_user_model

from apps.community.models import Notification

from .models import Badge, UserBadge

User = get_user_model()

DEFAULT_BADGES = [
    {
        "code": "teacher",
        "name": "Teacher",
        "description": "Earned when your answer is marked helpful or accepted by someone you helped.",
        "icon": "graduation-cap",
    },
    {
        "code": "solver",
        "name": "Solver",
        "description": "Earned when a problem you worked on is confirmed solved.",
        "icon": "puzzle",
    },
    {
        "code": "collaborator",
        "name": "Collaborator",
        "description": "Earned when you contribute to a research document with co-authors.",
        "icon": "users",
    },
]


def award_badge(user, code, actor=None):
    """Award badge `code` to `user`. Returns True if newly awarded."""
    try:
        badge = Badge.objects.get(code=code, active=True)
    except Badge.DoesNotExist:
        return False
    user_badge, created = UserBadge.objects.get_or_create(user=user, badge=badge, defaults={"awarded_by": actor})
    if created:
        from apps.accounts.models import Profile

        Profile.objects.filter(user=user).update(
            badge_count=UserBadge.objects.filter(user=user).count()
        )
        Notification.objects.create(
            user=user,
            actor=actor,
            verb=Notification.VERB.BADGE,
            text=f"You earned the {badge.name} badge!",
        )
        from apps.push.services import push_to_user

        push_to_user(
            user,
            "New badge earned",
            f"You earned the {badge.name} badge!",
            href="/notifications",
        )
    return created


def revoke_badge(user, code):
    """Revoke badge `code` from `user`. Returns True if removed."""
    deleted, _ = UserBadge.objects.filter(user=user, badge__code=code).delete()
    if deleted:
        from apps.accounts.models import Profile

        Profile.objects.filter(user=user).update(
            badge_count=UserBadge.objects.filter(user=user).count()
        )
    return bool(deleted)
