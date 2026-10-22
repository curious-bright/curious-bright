import uuid

from django.conf import settings
from django.db import models


def new_reference():
    return f"cb_{uuid.uuid4().hex}"


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        ABANDONED = "abandoned", "Abandoned"

    reference = models.CharField(max_length=64, unique=True, default=new_reference)
    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.PROTECT, related_name="payments"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="payments"
    )
    plan_code = models.CharField(max_length=32)
    amount = models.PositiveBigIntegerField(help_text="Minor units (kobo/cents).")
    currency = models.CharField(max_length=3, default="NGN")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    provider = models.CharField(max_length=32, default="paystack")
    provider_reference = models.CharField(max_length=128, blank=True)
    authorization_url = models.URLField(max_length=500, blank=True)
    access_code = models.CharField(max_length=128, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} ({self.status})"


class OrganizationSubscription(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAST_DUE = "past_due", "Past due"
        CANCELED = "canceled", "Canceled"
        EXPIRED = "expired", "Expired"

    organization = models.OneToOneField(
        "organizations.Organization", on_delete=models.CASCADE, related_name="subscription"
    )
    plan_code = models.CharField(max_length=32, default="free")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    amount = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="NGN")
    auto_renew = models.BooleanField(default=False)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    provider_subscription_code = models.CharField(max_length=128, blank=True)
    provider_email_token = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.organization.slug}: {self.plan_code} ({self.status})"


class WebhookEvent(models.Model):
    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        PROCESSED = "processed", "Processed"
        IGNORED = "ignored", "Ignored"
        ERROR = "error", "Error"

    provider = models.CharField(max_length=32, default="paystack")
    event_id = models.CharField(max_length=128, unique=True)
    event_type = models.CharField(max_length=80, blank=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECEIVED)
    error = models.CharField(max_length=500, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event_type} ({self.status})"


class PlanTier(models.Model):
    class TierType(models.TextChoices):
        FREE = "free", "Free / Basic"
        NGO = "ngo", "Non-Governmental Organization (NGO)"
        RESEARCH_INSTITUTE = "research_institute", "Research Institute"
        UNIVERSITY = "university", "University"
        PRO = "pro", "Pro"
        ENTERPRISE = "enterprise", "Enterprise"

    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    tier_type = models.CharField(max_length=40, choices=TierType.choices, default=TierType.FREE)
    tagline = models.CharField(max_length=255, blank=True)
    monthly_price_ngn = models.PositiveBigIntegerField(default=0, help_text="Minor units (kobo). E.g. 2500000 = ₦25,000")
    monthly_price_usd = models.PositiveBigIntegerField(default=0, help_text="Minor units (cents). E.g. 2500 = $25")
    annual_price_ngn = models.PositiveBigIntegerField(default=0, help_text="Minor units (kobo). E.g. 25000000 = ₦250,000 (2 months free)")
    annual_price_usd = models.PositiveBigIntegerField(default=0, help_text="Minor units (cents). E.g. 25000 = $250 (2 months free)")
    seat_limit = models.PositiveIntegerField(default=50, help_text="0 means unlimited seats")
    storage_limit_gb = models.PositiveIntegerField(default=10)
    video_minutes_limit = models.PositiveIntegerField(default=1000)
    features = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["monthly_price_usd", "name"]

    def __str__(self):
        return f"{self.name} ({self.code})"
