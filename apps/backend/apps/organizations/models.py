import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from .storage import private_storage
from .validators import validate_verification_document, verification_document_path


def verification_token_expiry():
    return timezone.now() + timezone.timedelta(hours=24)


class Organization(models.Model):
    class OrgType(models.TextChoices):
        UNIVERSITY = "university", "University"
        RESEARCH_INSTITUTE = "research_institute", "Research Institute"
        NGO = "ngo", "NGO"
        OTHER = "other", "Other"

    class Plan(models.TextChoices):
        FREE = "free", "Free"
        NGO = "ngo", "NGO"
        RESEARCH_INSTITUTE = "research_institute", "Research Institute"
        UNIVERSITY = "university", "University"
        PRO = "pro", "Pro"
        ENTERPRISE = "enterprise", "Enterprise"

    class SubscriptionStatus(models.TextChoices):
        NONE = "none", "Not subscribed"
        ACTIVE = "active", "Active"
        PAST_DUE = "past_due", "Past due"
        CANCELED = "canceled", "Canceled"

    class VerificationStatus(models.TextChoices):
        UNVERIFIED = "unverified", "Unverified"
        EMAIL_PENDING = "email_pending", "Email pending"
        PENDING_REVIEW = "pending_review", "Pending admin review"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"
        SUSPENDED = "suspended", "Suspended"

    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=80, unique=True, blank=True)
    org_type = models.CharField(max_length=30, choices=OrgType.choices, default=OrgType.UNIVERSITY)
    tier = models.ForeignKey("billing.PlanTier", null=True, blank=True, on_delete=models.SET_NULL, related_name="organizations")
    domain = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        help_text="Primary email domain, e.g. greenfield.edu",
    )
    country = models.CharField(max_length=100, blank=True, default="")
    logo = models.FileField(upload_to="org-logos/%Y/%m/", null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_organizations"
    )
    plan_tier = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    subscription_status = models.CharField(
        max_length=20, choices=SubscriptionStatus.choices, default=SubscriptionStatus.NONE
    )
    seat_limit = models.PositiveIntegerField(
        default=50, help_text="0 means unlimited (enterprise)."
    )
    auto_join_domain = models.BooleanField(
        default=False, help_text="Let people with a matching email domain join automatically."
    )
    allow_join_requests = models.BooleanField(
        default=True,
        help_text="Let verified organizations receive join requests from members.",
    )
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.UNVERIFIED,
        db_index=True,
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    suspension_reason = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.domain:
            self.domain = self.domain.strip().lower().lstrip("@")
        if not self.slug:
            base = slugify(self.name)[:60] or "organization"
            candidate = base
            suffix = 2
            while Organization.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{suffix}"
                suffix += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    @property
    def is_verified(self):
        return self.verification_status == self.VerificationStatus.VERIFIED

    @property
    def can_grant_access(self):
        """Only verified organizations may create or invite new members."""
        return self.is_verified

    @property
    def is_enterprise(self):
        return self.plan_tier == self.Plan.ENTERPRISE

    @property
    def seats_remaining(self):
        if self.seat_limit == 0:
            return None
        return max(0, self.seat_limit - self.seats_used)

    @property
    def seats_used(self):
        active = self.memberships.filter(status=OrganizationMembership.Status.ACTIVE).count()
        pending = self.invitations.filter(
            accepted_at__isnull=True, revoked_at__isnull=True, expires_at__gt=timezone.now()
        ).count()
        return active + pending


class OrganizationVerification(models.Model):
    """The current verification submission for an organization.

    Rejected organizations can edit and resubmit this record. Every submission
    and decision is also written to ``OrganizationVerificationEvent`` so the
    review history survives resubmissions.
    """

    organization = models.OneToOneField(
        Organization, on_delete=models.CASCADE, related_name="verification"
    )
    legal_name = models.CharField(max_length=200)
    org_type = models.CharField(max_length=30, choices=Organization.OrgType.choices)
    country = models.CharField(max_length=100)
    address = models.TextField()
    website = models.URLField(max_length=300)
    official_email = models.EmailField()
    official_email_verified_at = models.DateTimeField(null=True, blank=True)
    official_email_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    official_email_token_expires_at = models.DateTimeField(
        default=verification_token_expiry,
        null=True,
        blank=True,
    )
    official_email_code_hash = models.CharField(max_length=128, blank=True)
    official_email_code_expires_at = models.DateTimeField(null=True, blank=True)
    official_email_code_attempts = models.PositiveSmallIntegerField(default=0)
    official_email_last_sent_at = models.DateTimeField(null=True, blank=True)
    official_email_domain_matches = models.BooleanField(default=True)
    contact_name = models.CharField(max_length=120)
    contact_role = models.CharField(max_length=120)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=40, blank=True)
    registration_number = models.CharField(max_length=120, blank=True)
    registration_document = models.FileField(
        upload_to=verification_document_path,
        storage=private_storage,
        validators=[validate_verification_document],
        null=True,
        blank=True,
    )
    is_government_funded = models.BooleanField(default=False)
    head_of_institution = models.CharField(
        max_length=160,
        blank=True,
        help_text="Vice-Chancellor, Dean, Rector or equivalent for public institutions.",
    )
    head_role = models.CharField(max_length=80, blank=True)
    head_email = models.EmailField(blank=True)
    info_requested_at = models.DateTimeField(null=True, blank=True)
    info_request_note = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="organization_verifications_reviewed",
    )
    rejection_reason = models.TextField(blank=True)
    attempt = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Verification for {self.organization.slug}"

    @property
    def official_email_verified(self):
        return self.official_email_verified_at is not None

    @property
    def head_name(self):
        return self.head_of_institution

    @head_name.setter
    def head_name(self, value):
        self.head_of_institution = value or ""

    @property
    def confirmation_token_expired(self):
        return bool(
            self.official_email_token_expires_at
            and self.official_email_token_expires_at <= timezone.now()
        )


class OrganizationVerificationEvent(models.Model):
    class Action(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        EMAIL_CONFIRMED = "email_confirmed", "Official email confirmed"
        EMAIL_CHANGED = "email_changed", "Official email changed"
        EMAIL_RESENT = "email_resent", "Confirmation email resent"
        DOMAIN_CHANGED = "domain_changed", "Email domain changed"
        INFO_REQUESTED = "info_requested", "More information requested"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        RESUBMITTED = "resubmitted", "Resubmitted"
        SUSPENDED = "suspended", "Suspended"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="verification_events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="organization_verification_events",
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    note = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} @ {self.organization.slug}"


class OrganizationJoinRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="join_requests"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="organization_join_requests"
    )
    message = models.TextField(max_length=1000, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="organization_join_requests_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"],
                condition=models.Q(status="pending"),
                name="unique_pending_org_join_request",
            )
        ]

    def __str__(self):
        return f"{self.user.username} -> {self.organization.slug} ({self.status})"


class OrganizationMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MODERATOR = "moderator", "Moderator"
        TEACHER = "teacher", "Teacher"
        STUDENT = "student", "Student"
        MEMBER = "member", "Member"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INVITED = "invited", "Invited"
        SUSPENDED = "suspended", "Suspended"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="org_memberships"
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    title = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    student_id = models.CharField(max_length=64, blank=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="org_invites_sent",
    )
    joined_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["role", "joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"], name="unique_org_membership"
            )
        ]

    def __str__(self):
        return f"{self.user.username} @ {self.organization.slug} ({self.role})"


class OrganizationInvitation(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="invitations"
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=20,
        choices=OrganizationMembership.Role.choices,
        default=OrganizationMembership.Role.MEMBER,
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="org_invitations",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="org_invitations_accepted",
    )
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "email"],
                condition=models.Q(accepted_at__isnull=True, revoked_at__isnull=True),
                name="unique_pending_org_invitation",
            )
        ]

    def __str__(self):
        return f"{self.email} -> {self.organization.slug}"

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def is_pending(self):
        return (
            self.accepted_at is None
            and self.revoked_at is None
            and self.expires_at > timezone.now()
        )


class OrganizationAuditLog(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="org_audit_entries",
    )
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=60, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} @ {self.organization.slug}"
