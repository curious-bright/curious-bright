import logging
from urllib.parse import urlparse

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import (
    Organization,
    OrganizationAuditLog,
    OrganizationVerification,
    OrganizationVerificationEvent,
)

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


def _send(to, subject, message):
    try:
        send_mail(
            subject,
            message,
            getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@curiousbright.com.ng"),
            [to],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception("Failed to send organization email to %s", to)
        return False


def verification_event(organization, action, actor=None, note="", **metadata):
    event = OrganizationVerificationEvent.objects.create(
        organization=organization,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        note=note or "",
        metadata=metadata,
    )
    audit(
        organization,
        actor,
        f"verification.{action}",
        event,
        note=note or "",
        **metadata,
    )
    return event


def normalize_domain(value):
    value = (value or "").strip().lower().lstrip("@")
    if not value:
        return ""
    if "://" in value:
        parsed = urlparse(value)
        value = parsed.hostname or ""
    value = value.split("/", 1)[0].split(":", 1)[0]
    if value.startswith("www."):
        value = value[4:]
    return value


def website_domain(website):
    return normalize_domain(website)


def email_domain(email):
    return normalize_domain((email or "").rsplit("@", 1)[-1])


def domains_match(website, email):
    site = website_domain(website)
    mail = email_domain(email)
    if not site or not mail:
        return False
    return mail == site or mail.endswith(f".{site}") or site.endswith(f".{mail}")


def send_verification_confirmation_email(verification):
    org = verification.organization
    base = getattr(settings, "ORG_FRONTEND_URL", "https://org.curiousbright.com.ng").rstrip("/")
    link = f"{base}/verification/email/{verification.official_email_token}"
    subject = f"Confirm the official email for {org.name}"
    message = (
        f"We received a verification request for {org.name}.\n\n"
        f"Confirm that {verification.official_email} belongs to your institution:\n"
        f"{link}\n\n"
        "If you did not request this, you can ignore this email."
    )
    return _send(verification.official_email, subject, message)


def send_verification_decision_email(organization, approved, note=""):
    owner = organization.owner
    if not owner or not owner.email:
        return False
    if approved:
        subject = f"{organization.name} is verified on Curious Bright"
        message = (
            f"Good news — {organization.name} is now a verified institution.\n\n"
            "You can now create student accounts, import rosters and invite members."
        )
    else:
        subject = f"Update on {organization.name} verification"
        message = (
            f"Your verification request for {organization.name} was not approved.\n\n"
            f"Reviewer note: {note or 'Please review your details and resubmit.'}\n\n"
            "You can update the information and submit it again from the institutional portal."
        )
    return _send(owner.email, subject, message)


def send_join_request_email(organization, join_request):
    recipients = list(
        organization.memberships.filter(role__in=["owner", "admin"], status="active")
        .select_related("user")
        .values_list("user__email", flat=True)
    )
    if not recipients:
        return False
    requester = join_request.user
    subject = f"{requester.username} asked to join {organization.name}"
    message = (
        f"{requester.username} ({requester.email}) requested to join {organization.name}.\n\n"
        f"Message: {join_request.message or 'No message provided.'}\n\n"
        "Review the request in the institutional portal."
    )
    return all(_send(email, subject, message) for email in recipients if email)


def send_join_decision_email(organization, join_request, approved, note=""):
    subject = (
        f"You joined {organization.name}"
        if approved
        else f"Update on your request to join {organization.name}"
    )
    if approved:
        message = (
            f"Your request to join {organization.name} was approved.\n\n"
            "Sign in to the learning app to see your organization membership."
        )
    else:
        message = (
            f"Your request to join {organization.name} was not approved.\n\n"
            f"Note: {note or 'No reason was provided.'}"
        )
    return _send(join_request.user.email, subject, message)


def approve_verification(verification, reviewed_by, note=""):
    org = verification.organization
    now = timezone.now()
    verification.reviewed_at = now
    verification.reviewed_by = reviewed_by
    verification.rejection_reason = ""
    verification.save(update_fields=["reviewed_at", "reviewed_by", "rejection_reason", "updated_at"])
    org.verification_status = Organization.VerificationStatus.VERIFIED
    org.verified_at = now
    org.save(update_fields=["verification_status", "verified_at", "updated_at"])
    verification_event(org, OrganizationVerificationEvent.Action.APPROVED, reviewed_by, note)
    send_verification_decision_email(org, True, note)
    return verification


def reject_verification(verification, reviewed_by, note):
    org = verification.organization
    now = timezone.now()
    verification.reviewed_at = now
    verification.reviewed_by = reviewed_by
    verification.rejection_reason = note or "The submitted details could not be verified."
    verification.save(
        update_fields=["reviewed_at", "reviewed_by", "rejection_reason", "updated_at"]
    )
    org.verification_status = Organization.VerificationStatus.REJECTED
    org.verified_at = None
    org.save(update_fields=["verification_status", "verified_at", "updated_at"])
    verification_event(
        org,
        OrganizationVerificationEvent.Action.REJECTED,
        reviewed_by,
        verification.rejection_reason,
    )
    send_verification_decision_email(org, False, verification.rejection_reason)
    return verification
