from apps.accounts.models import Follow, Profile

from .models import Conversation, UserBlock


def messaging_allowed(actor, target, *, existing=False):
    """Return ``(allowed, reason)`` for a private conversation.

    ``existing`` bypasses the profile privacy gate so an existing conversation
    can continue unless one participant blocks the other. Organization admins,
    moderators and platform staff are intentionally not special-cased: private
    messages are private.
    """
    if actor.pk == target.pk:
        return False, "You cannot message yourself."
    if not target.is_active:
        return False, "That account is not available."
    if UserBlock.either_direction(actor, target):
        return False, "Messaging is unavailable because one of you blocked the other."
    if existing:
        return True, ""

    privacy = getattr(getattr(target, "profile", None), "message_privacy", Profile.MessagePrivacy.ANYONE)
    if privacy == Profile.MessagePrivacy.ANYONE:
        return True, ""
    if privacy == Profile.MessagePrivacy.FOLLOWS:
        follows = Follow.objects.filter(follower=target, followed=actor).exists()
        return (True, "") if follows else (False, "This person only accepts messages from people they follow.")
    return False, "This person is not accepting new messages."


def conversation_for_user(conversation_id, user):
    return (
        Conversation.objects.filter(
            pk=conversation_id, participants__user=user
        )
        .distinct()
        .first()
    )
