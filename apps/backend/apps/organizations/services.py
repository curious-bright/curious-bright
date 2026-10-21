import logging

from django.conf import settings
from django.core.mail import send_mail

from .models import OrganizationAuditLog

logger = logging.getLogger(__name__)

ROLE_RANK = {
    "member": 1,
    "student": 1,
    "teacher": 2,
    "moderator": 3,
    "admin": 4,
    "owner": 5,
}


def role_rank(role):
    return ROLE_RANK.get(role, 0)


def can_manage(role):
    return role_rank(role) >= ROLE_RANK["admin"]


def audit(organization, actor, action, target=None, **metadata):
    OrganizationAuditLog.objects.create(
        organization=organization,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type=type(target).__name__ if target is not None else "",
        target_id=str(getattr(target, "pk", "") or ""),
        metadata=metadata,
    )


def send_invitation_email(invitation):
    org = invitation.organization
    base = getattr(settings, "ORG_FRONTEND_URL", "https://org.curiousbright.com.ng").rstrip("/")
    link = f"{base}/invitations/{invitation.token}"
    subject = f"You're invited to {org.name} on Curious Bright"
    message = (
        f"{invitation.invited_by.username if invitation.invited_by else 'An administrator'} "
        f"invited you to join {org.name} as a {invitation.role}.\n\n"
        f"Accept the invitation: {link}\n\n"
        f"This link expires on {invitation.expires_at:%d %b %Y}."
    )
    try:
        send_mail(
            subject,
            message,
            getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@curiousbright.com.ng"),
            [invitation.email],
            fail_silently=False,
        )
    except Exception:  # email must never break the invite API
        logger.exception("Failed to send organization invitation to %s", invitation.email)
