import logging

from django.conf import settings
from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.mail import send_mail

from apps.community.models import Notification
from apps.community.notifications import notify

from .models import ModeratorApplication

logger = logging.getLogger(__name__)


def notify_application_decision(application, actor, approved, note=""):
    """Notify, email and audit a moderator-application decision."""
    text = (
        "Your moderator application was approved — welcome to the review team!"
        if approved
        else "Your moderator application was not approved this time."
    )
    notify(application.user, Notification.VERB.REVIEW, actor=actor, text=text)
    if application.user.email:
        subject = (
            "Your Curious Bright moderator application was approved"
            if approved
            else "Update on your Curious Bright moderator application"
        )
        body = text
        if note:
            body = f"{body}\n\nReviewer note: {note}"
        try:
            send_mail(
                subject,
                body,
                getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@curiousbright.com.ng"),
                [application.user.email],
                fail_silently=False,
            )
        except Exception:
            logger.exception("Moderator decision email failed for %s", application.user_id)
    try:
        LogEntry.objects.log_action(
            user_id=actor.pk,
            content_type_id=ContentType.objects.get_for_model(ModeratorApplication).pk,
            object_id=application.pk,
            object_repr=str(application),
            action_flag=CHANGE,
            change_message=(
                f"Moderator application {'approved' if approved else 'declined'}"
                + (f": {note}" if note else "")
            ),
        )
    except Exception:
        logger.exception("Could not write admin log for moderator application %s", application.pk)
    return application
