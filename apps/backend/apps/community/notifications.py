"""Shared helpers for notifications and @mentions."""
import re

from django.contrib.auth import get_user_model

from .models import Notification

User = get_user_model()
MENTION_RE = re.compile(r"@([A-Za-z0-9_]+)")


def notify(user, verb, actor=None, text="", post=None, comment=None):
    if user is None:
        return None
    if actor is not None and user == actor:
        return None  # never notify yourself
    return Notification.objects.create(
        user=user, actor=actor, verb=verb, text=text, post=post, comment=comment
    )


def extract_mentions(body):
    usernames = set(MENTION_RE.findall(body or ""))
    if not usernames:
        return User.objects.none()
    return User.objects.filter(username__in=usernames)


def notify_mentions(body, actor, post=None, comment=None):
    for user in extract_mentions(body):
        if user == actor:
            continue
        notify(
            user,
            Notification.VERB.MENTION,
            actor=actor,
            text=f"@{actor.username} mentioned you",
            post=post,
            comment=comment,
        )
