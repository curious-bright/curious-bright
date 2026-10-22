from django.contrib import admin

from .models import OrganizationSubscription, Payment, PlanTier, WebhookEvent


@admin.register(PlanTier)
class PlanTierAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "code",
        "tier_type",
        "monthly_price_ngn",
        "monthly_price_usd",
        "annual_price_ngn",
        "annual_price_usd",
        "seat_limit",
        "is_active",
    )
    list_filter = ("tier_type", "is_active")
    search_fields = ("name", "code", "tagline")
    prepopulated_fields = {"code": ("name",)}


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "reference", "organization", "plan_code", "amount", "currency", "status", "created_at"
    )
    list_filter = ("status", "currency", "plan_code", "provider")
    search_fields = ("reference", "organization__name", "created_by__username", "provider_reference")
    autocomplete_fields = ("organization", "created_by")
    readonly_fields = (
        "reference", "provider_reference", "authorization_url", "access_code",
        "metadata", "paid_at", "created_at", "updated_at",
    )


@admin.register(OrganizationSubscription)
class OrganizationSubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "organization", "plan_code", "status", "amount", "currency",
        "current_period_end", "auto_renew",
    )
    list_filter = ("status", "plan_code", "currency", "auto_renew")
    search_fields = ("organization__name", "organization__slug", "provider_subscription_code")
    autocomplete_fields = ("organization",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "status", "provider", "created_at", "processed_at")
    list_filter = ("status", "event_type", "provider")
    search_fields = ("event_id", "event_type", "error")
    readonly_fields = (
        "provider", "event_id", "event_type", "payload", "status", "error",
        "processed_at", "created_at",
    )

    def has_add_permission(self, request):
        return False
