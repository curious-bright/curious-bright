import logging
import secrets
import uuid
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.urls import reverse
from django.utils import timezone
from django.utils.html import escape

from apps.core.emails import dispatch_email

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

DOCUMENT_SIGNING_SALT = "curiousbright.org-verification-document"
DOCUMENT_SIGNING_MAX_AGE = 300


class VerificationError(Exception):
    """A user-facing verification error with a stable machine code."""

    def __init__(self, code, message, status=400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


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


def _send(to, subject, text, *, kind="organization", html=None, user_id=None):
    """Send through the shared Resend/Django email dispatcher."""
    if not to:
        return False
    body = html or f"<p>{escape(text).replace(chr(10), '<br>')}</p>"
    result = dispatch_email(
        subject=subject,
        to=to,
        text=text,
        html=body,
        kind=kind,
        user_id=user_id,
        wait=True,
    )
    return bool(result.sent)


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
    return _send(
        invitation.email,
        subject,
        message,
        kind="organization_invitation",
        user_id=getattr(invitation.invited_by, "pk", None),
    )


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
    return all(
        _send(email, subject, message, kind="organization_join_request")
        for email in recipients
        if email
    )


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
    return _send(
        join_request.user.email,
        subject,
        message,
        kind="organization_join_decision",
        user_id=join_request.user_id,
    )


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


def generate_verification_code():
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_verification_code(code):
    return make_password(code)


def _code_matches(verification, code):
    if not verification.official_email_code_hash:
        return False
    return check_password(code, verification.official_email_code_hash)


def _email_html(title, paragraphs, *, cta_label=None, cta_url=None, code=None):
    parts = [
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:auto">',
        f"<h2 style=\"color:#172033\">{escape(title)}</h2>",
    ]
    for paragraph in paragraphs:
        parts.append(f"<p>{escape(paragraph)}</p>")
    if code:
        parts.append(
            '<p style="font-size:30px;letter-spacing:6px;font-weight:700;'
            'background:#fff1ec;color:#c73214;padding:14px 18px;border-radius:10px;'
            f'display:inline-block">{escape(code)}</p>'
        )
    if cta_label and cta_url:
        parts.append(
            f'<p><a href="{escape(cta_url)}" style="display:inline-block;background:#ff5a36;'
            'color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;'
            f'font-weight:700">{escape(cta_label)}</a></p>'
        )
    parts.append(
        '<p style="color:#64748b;font-size:12px">CuriousBright · '
        "This is an automated message. Do not reply with verification codes.</p>"
    )
    parts.append("</div>")
    return "".join(parts)


def send_verification_confirmation_email(verification, code=None):
    org = verification.organization
    base = getattr(settings, "ORG_FRONTEND_URL", "https://org.curiousbright.com.ng").rstrip("/")
    link = f"{base}/verification/email/{verification.official_email_token}"
    ttl_hours = int(getattr(settings, "ORG_VERIFICATION_TOKEN_TTL_HOURS", 24))
    code_minutes = int(getattr(settings, "ORG_VERIFICATION_CODE_TTL_MINUTES", 15))
    subject = f"Confirm the official email for {org.name}"
    text = (
        f"We received a verification request for {org.name}.\n\n"
        f"Confirm that {verification.official_email} belongs to your institution:\n"
        f"{link}\n\n"
        f"Or enter this six-digit code: {code or 'see the link above'}\n\n"
        f"The link expires in {ttl_hours} hours. The code expires in {code_minutes} minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )
    html = _email_html(
        f"Confirm the official email for {org.name}",
        [
            f"We received a verification request for {org.name}.",
            f"Confirm that {verification.official_email} belongs to your institution.",
            f"This link expires in {ttl_hours} hours.",
        ],
        cta_label="Confirm official email",
        cta_url=link,
        code=code,
    )
    return _send(
        verification.official_email,
        subject,
        text,
        kind="org_verification_confirmation",
        html=html,
        user_id=org.owner_id,
    )


def send_verification_decision_email(organization, approved, note=""):
    owner = organization.owner
    if not owner or not owner.email:
        return False
    base = getattr(settings, "ORG_FRONTEND_URL", "https://org.curiousbright.com.ng").rstrip("/")
    if approved:
        subject = f"{organization.name} is verified on Curious Bright"
        text = (
            f"Good news — {organization.name} is now a verified institution.\n\n"
            "You can now create student accounts, import rosters and invite members.\n\n"
            f"Open the institutional portal: {base}"
        )
        html = _email_html(
            f"{organization.name} is verified",
            [
                f"Good news — {organization.name} is now a verified institution.",
                "You can now create student accounts, import rosters and invite members.",
            ],
            cta_label="Open the portal",
            cta_url=base,
        )
    else:
        subject = f"Update on {organization.name} verification"
        text = (
            f"Your verification request for {organization.name} was not approved.\n\n"
            f"Reviewer note: {note or 'Please review your details and resubmit.'}\n\n"
            "You can update the information and submit it again from the institutional portal.\n\n"
            f"{base}"
        )
        html = _email_html(
            f"Update on {organization.name} verification",
            [
                f"Your verification request for {organization.name} was not approved.",
                f"Reviewer note: {note or 'Please review your details and resubmit.'}",
                "You can update the information and submit it again from the institutional portal.",
            ],
            cta_label="Update verification",
            cta_url=base,
        )
    return _send(
        owner.email,
        subject,
        text,
        kind="org_verification_decision",
        html=html,
        user_id=owner.pk,
    )


def send_verification_info_request_email(organization, note):
    owner = organization.owner
    if not owner or not owner.email:
        return False
    base = getattr(settings, "ORG_FRONTEND_URL", "https://org.curiousbright.com.ng").rstrip("/")
    subject = f"More information needed for {organization.name}"
    text = (
        f"A reviewer needs more information before {organization.name} can be verified.\n\n"
        f"Reviewer note: {note}\n\n"
        "Sign in to the institutional portal, update your verification details, and resubmit.\n\n"
        f"{base}"
    )
    html = _email_html(
        f"More information needed for {organization.name}",
        [
            f"A reviewer needs more information before {organization.name} can be verified.",
            f"Reviewer note: {note}",
            "Sign in to the institutional portal, update your verification details, and resubmit.",
        ],
        cta_label="Update verification",
        cta_url=base,
    )
    return _send(
        owner.email,
        subject,
        text,
        kind="org_verification_info_request",
        html=html,
        user_id=owner.pk,
    )


def send_suspension_email(organization, note):
    owner = organization.owner
    if not owner or not owner.email:
        return False
    subject = f"{organization.name} verification suspended"
    text = (
        f"Verification for {organization.name} has been suspended.\n\n"
        f"Reason: {note}\n\n"
        "Existing memberships remain in place, but new invitations, student "
        "accounts and join-request approvals are blocked.\n\n"
        "Contact support@curiousbright.com.ng or your platform administrator if "
        "you believe this is a mistake."
    )
    html = _email_html(
        f"{organization.name} verification suspended",
        [
            f"Verification for {organization.name} has been suspended.",
            f"Reason: {note}",
            "Existing memberships remain in place, but new invitations, student "
            "accounts and join-request approvals are blocked.",
            "Contact support@curiousbright.com.ng or your platform administrator if "
            "you believe this is a mistake.",
        ],
    )
    return _send(
        owner.email,
        subject,
        text,
        kind="org_verification_suspension",
        html=html,
        user_id=owner.pk,
    )


def send_admin_pending_review_email(verification):
    recipient = (getattr(settings, "ORG_REVIEW_NOTIFY_EMAIL", "") or "").strip()
    if not recipient:
        return False
    org = verification.organization
    admin_base = getattr(settings, "ADMIN_BASE_URL", "http://localhost:8000").rstrip("/")
    try:
        review_url = admin_base + reverse(
            "admin:organizations_organizationverification_change",
            args=[verification.pk],
        )
    except Exception:
        review_url = f"{admin_base}/admin/organizations/organizationverification/{verification.pk}/change/"
    subject = f"Organization awaiting review: {org.name}"
    text = (
        f"{org.name} confirmed its official email and is waiting for admin review.\n\n"
        f"Legal name: {verification.legal_name}\n"
        f"Type: {verification.get_org_type_display()}\n"
        f"Country: {verification.country}\n"
        f"Official email: {verification.official_email}\n"
        f"Official email matches website domain: "
        f"{'yes' if verification.official_email_domain_matches else 'NO — check this'}\n\n"
        f"Review: {review_url}"
    )
    html = _email_html(
        f"Organization awaiting review: {org.name}",
        [
            f"{org.name} confirmed its official email and is waiting for admin review.",
            f"Legal name: {verification.legal_name}",
            f"Type: {verification.get_org_type_display()}",
            f"Country: {verification.country}",
            f"Official email: {verification.official_email}",
            "Official email matches website domain: "
            f"{'yes' if verification.official_email_domain_matches else 'NO — check this'}",
        ],
        cta_label="Review in admin",
        cta_url=review_url,
    )
    return _send(
        recipient,
        subject,
        text,
        kind="org_verification_admin_alert",
        html=html,
    )


def issue_official_email_challenge(verification, *, send=True):
    """Rotate the link token and six-digit code, then optionally email them."""
    now = timezone.now()
    code = generate_verification_code()
    ttl_hours = int(getattr(settings, "ORG_VERIFICATION_TOKEN_TTL_HOURS", 24))
    code_minutes = int(getattr(settings, "ORG_VERIFICATION_CODE_TTL_MINUTES", 15))
    verification.official_email_token = uuid.uuid4()
    verification.official_email_token_expires_at = now + timezone.timedelta(hours=ttl_hours)
    verification.official_email_code_hash = hash_verification_code(code)
    verification.official_email_code_expires_at = now + timezone.timedelta(
        minutes=code_minutes
    )
    verification.official_email_code_attempts = 0
    verification.official_email_last_sent_at = now
    verification.save(
        update_fields=[
            "official_email_token",
            "official_email_token_expires_at",
            "official_email_code_hash",
            "official_email_code_expires_at",
            "official_email_code_attempts",
            "official_email_last_sent_at",
            "updated_at",
        ]
    )
    sent = send_verification_confirmation_email(verification, code=code) if send else None
    return code, sent


def _mark_email_confirmed(verification, actor=None):
    org = verification.organization
    if org.verification_status == Organization.VerificationStatus.VERIFIED:
        raise VerificationError(
            "already_verified", "This organization is already verified.", 409
        )
    if org.verification_status == Organization.VerificationStatus.SUSPENDED:
        raise VerificationError(
            "organization_suspended",
            "This organization is suspended. Contact support.",
            403,
        )
    if verification.official_email_verified_at is not None:
        raise VerificationError(
            "already_confirmed", "This official email is already confirmed.", 409
        )
    now = timezone.now()
    verification.official_email_verified_at = now
    verification.official_email_token = uuid.uuid4()
    verification.official_email_token_expires_at = None
    verification.official_email_code_hash = ""
    verification.official_email_code_expires_at = None
    verification.official_email_code_attempts = 0
    verification.rejection_reason = ""
    verification.info_requested_at = None
    verification.info_request_note = ""
    verification.save(
        update_fields=[
            "official_email_verified_at",
            "official_email_token",
            "official_email_token_expires_at",
            "official_email_code_hash",
            "official_email_code_expires_at",
            "official_email_code_attempts",
            "rejection_reason",
            "info_requested_at",
            "info_request_note",
            "updated_at",
        ]
    )
    org.verification_status = Organization.VerificationStatus.PENDING_REVIEW
    org.verified_at = None
    org.save(update_fields=["verification_status", "verified_at", "updated_at"])
    verification_event(
        org,
        OrganizationVerificationEvent.Action.EMAIL_CONFIRMED,
        actor,
    )
    send_admin_pending_review_email(verification)
    return verification


def confirm_official_email_by_token(token, actor=None):
    verification = OrganizationVerification.objects.select_related("organization").filter(
        official_email_token=token
    ).first()
    if verification is None:
        raise VerificationError(
            "invalid_token", "This confirmation link is invalid or has already been used.", 404
        )
    if verification.official_email_token_expires_at and (
        verification.official_email_token_expires_at <= timezone.now()
    ):
        raise VerificationError(
            "token_expired",
            "This confirmation link has expired. Ask an organization admin to resend it.",
            410,
        )
    return _mark_email_confirmed(verification, actor)


def confirm_official_email_by_code(official_email, code, actor=None):
    verification = (
        OrganizationVerification.objects.select_related("organization")
        .filter(official_email__iexact=(official_email or "").strip())
        .order_by("-updated_at")
        .first()
    )
    if verification is None:
        raise VerificationError("invalid_code", "That email or code is not valid.", 400)
    if verification.official_email_verified_at is not None:
        raise VerificationError(
            "already_confirmed", "This official email is already confirmed.", 409
        )
    if not verification.official_email_code_hash or not verification.official_email_code_expires_at:
        raise VerificationError(
            "code_expired", "That code has expired. Request a new confirmation email.", 410
        )
    if verification.official_email_code_expires_at <= timezone.now():
        raise VerificationError(
            "code_expired", "That code has expired. Request a new confirmation email.", 410
        )
    if verification.official_email_code_attempts >= 5:
        raise VerificationError(
            "too_many_attempts",
            "Too many incorrect attempts. Request a new confirmation email.",
            429,
        )
    if not _code_matches(verification, code):
        verification.official_email_code_attempts += 1
        verification.save(update_fields=["official_email_code_attempts", "updated_at"])
        if verification.official_email_code_attempts >= 5:
            raise VerificationError(
                "too_many_attempts",
                "Too many incorrect attempts. Request a new confirmation email.",
                429,
            )
        raise VerificationError("invalid_code", "That email or code is not valid.", 400)
    return _mark_email_confirmed(verification, actor)


def resend_confirmation(verification, *, actor=None):
    if verification.official_email_verified_at is not None:
        raise VerificationError(
            "already_confirmed", "This official email is already confirmed.", 409
        )
    org = verification.organization
    if org.verification_status in (
        Organization.VerificationStatus.VERIFIED,
        Organization.VerificationStatus.SUSPENDED,
    ):
        raise VerificationError(
            "not_resendable", "This organization cannot resend confirmation right now.", 409
        )
    cooldown = int(getattr(settings, "ORG_VERIFICATION_RESEND_COOLDOWN_SECONDS", 60))
    now = timezone.now()
    if verification.official_email_last_sent_at:
        elapsed = (now - verification.official_email_last_sent_at).total_seconds()
        if elapsed < cooldown:
            raise VerificationError(
                "cooldown",
                f"Please wait {int(cooldown - elapsed) + 1} seconds before resending.",
                429,
            )
    _code, sent = issue_official_email_challenge(verification)
    verification_event(
        org,
        OrganizationVerificationEvent.Action.EMAIL_RESENT,
        actor,
        sent=bool(sent),
    )
    return sent


def change_official_email(verification, new_email, *, actor=None):
    org = verification.organization
    if org.verification_status == Organization.VerificationStatus.SUSPENDED:
        raise VerificationError(
            "organization_suspended", "This organization is suspended.", 403
        )
    new_email = (new_email or "").strip().lower()
    try:
        validate_email(new_email)
    except DjangoValidationError as exc:
        raise VerificationError(
            "invalid_email", "Enter a valid official email address.", 400
        ) from exc
    if new_email == verification.official_email.lower():
        raise VerificationError(
            "same_email", "Enter a different official email address.", 400
        )
    if (
        OrganizationVerification.objects.filter(official_email__iexact=new_email)
        .exclude(pk=verification.pk)
        .exists()
    ):
        raise VerificationError(
            "email_in_use",
            "That email is already attached to another verification request.",
            409,
        )
    verification.official_email = new_email
    verification.official_email_verified_at = None
    verification.official_email_domain_matches = domains_match(
        verification.website, new_email
    )
    verification.rejection_reason = ""
    verification.info_requested_at = None
    verification.info_request_note = ""
    verification.save(
        update_fields=[
            "official_email",
            "official_email_verified_at",
            "official_email_domain_matches",
            "rejection_reason",
            "info_requested_at",
            "info_request_note",
            "updated_at",
        ]
    )
    org.verification_status = Organization.VerificationStatus.EMAIL_PENDING
    org.verified_at = None
    org.save(update_fields=["verification_status", "verified_at", "updated_at"])
    verification_event(
        org,
        OrganizationVerificationEvent.Action.EMAIL_CHANGED,
        actor,
        official_email=new_email,
        domain_matches=verification.official_email_domain_matches,
    )
    _code, sent = issue_official_email_challenge(verification)
    return sent


@transaction.atomic
def approve_verification(verification, reviewed_by, note=""):
    org = verification.organization
    if verification.official_email_verified_at is None:
        raise VerificationError(
            "email_not_confirmed",
            "The official email must be confirmed before this organization can be approved.",
            409,
        )
    if org.verification_status != Organization.VerificationStatus.PENDING_REVIEW:
        raise VerificationError(
            "invalid_status",
            "Only organizations in Pending Admin Review can be approved.",
            409,
        )
    now = timezone.now()
    verification.reviewed_at = now
    verification.reviewed_by = reviewed_by
    verification.rejection_reason = ""
    verification.info_requested_at = None
    verification.info_request_note = ""
    verification.save(
        update_fields=[
            "reviewed_at",
            "reviewed_by",
            "rejection_reason",
            "info_requested_at",
            "info_request_note",
            "updated_at",
        ]
    )
    org.verification_status = Organization.VerificationStatus.VERIFIED
    org.verified_at = now
    org.country = verification.country
    org.suspension_reason = ""
    org.save(
        update_fields=[
            "verification_status",
            "verified_at",
            "country",
            "suspension_reason",
            "updated_at",
        ]
    )
    verification_event(org, OrganizationVerificationEvent.Action.APPROVED, reviewed_by, note)
    send_verification_decision_email(org, True, note)
    return verification


@transaction.atomic
def reject_verification(verification, reviewed_by, note):
    org = verification.organization
    if org.verification_status != Organization.VerificationStatus.PENDING_REVIEW:
        raise VerificationError(
            "invalid_status",
            "Only organizations in Pending Admin Review can be rejected.",
            409,
        )
    note = (note or "").strip()
    if not note:
        raise VerificationError(
            "note_required", "A rejection note is required.", 400
        )
    now = timezone.now()
    verification.reviewed_at = now
    verification.reviewed_by = reviewed_by
    verification.rejection_reason = note
    verification.info_requested_at = None
    verification.info_request_note = ""
    verification.save(
        update_fields=[
            "reviewed_at",
            "reviewed_by",
            "rejection_reason",
            "info_requested_at",
            "info_request_note",
            "updated_at",
        ]
    )
    org.verification_status = Organization.VerificationStatus.REJECTED
    org.verified_at = None
    org.save(update_fields=["verification_status", "verified_at", "updated_at"])
    verification_event(
        org,
        OrganizationVerificationEvent.Action.REJECTED,
        reviewed_by,
        note,
    )
    send_verification_decision_email(org, False, note)
    return verification


@transaction.atomic
def request_more_information(verification, reviewed_by, note):
    org = verification.organization
    if org.verification_status != Organization.VerificationStatus.PENDING_REVIEW:
        raise VerificationError(
            "invalid_status",
            "More information can only be requested while the organization is in Pending Admin Review.",
            409,
        )
    note = (note or "").strip()
    if not note:
        raise VerificationError("note_required", "Explain what information is needed.", 400)
    verification.info_requested_at = timezone.now()
    verification.info_request_note = note
    verification.save(
        update_fields=["info_requested_at", "info_request_note", "updated_at"]
    )
    verification_event(
        org,
        OrganizationVerificationEvent.Action.INFO_REQUESTED,
        reviewed_by,
        note,
    )
    send_verification_info_request_email(org, note)
    return verification


@transaction.atomic
def suspend_organization(organization, actor, note):
    note = (note or "").strip()
    if not note:
        raise VerificationError("note_required", "A suspension reason is required.", 400)
    organization.verification_status = Organization.VerificationStatus.SUSPENDED
    organization.verified_at = None
    organization.suspension_reason = note
    organization.save(
        update_fields=[
            "verification_status",
            "verified_at",
            "suspension_reason",
            "updated_at",
        ]
    )
    verification_event(
        organization,
        OrganizationVerificationEvent.Action.SUSPENDED,
        actor,
        note,
    )
    send_suspension_email(organization, note)
    return organization


def verification_can_submit(org):
    if org.verification_status in (
        Organization.VerificationStatus.VERIFIED,
        Organization.VerificationStatus.SUSPENDED,
    ):
        return False
    verification = getattr(org, "verification", None)
    if org.verification_status == Organization.VerificationStatus.PENDING_REVIEW:
        return bool(verification and verification.info_requested_at)
    return True


def signed_document_url(verification, request=None):
    if not verification.registration_document:
        return None
    token = signing.dumps(
        {"verification_id": verification.pk},
        salt=DOCUMENT_SIGNING_SALT,
        compress=True,
    )
    path = reverse("org_verification_document_signed", kwargs={"token": token})
    return request.build_absolute_uri(path) if request else path


def load_signed_document(token):
    try:
        payload = signing.loads(
            token,
            salt=DOCUMENT_SIGNING_SALT,
            max_age=DOCUMENT_SIGNING_MAX_AGE,
        )
    except signing.BadSignature as exc:
        raise VerificationError(
            "invalid_signature",
            "This document link is invalid or has expired.",
            403,
        ) from exc
    verification = (
        OrganizationVerification.objects.select_related("organization")
        .filter(pk=payload.get("verification_id"))
        .first()
    )
    if verification is None or not verification.registration_document:
        raise VerificationError("not_found", "Document not found.", 404)
    return verification
