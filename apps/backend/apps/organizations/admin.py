from django import forms
from django.contrib import admin, messages
from django.utils.html import format_html

from .models import (
    Organization,
    OrganizationAuditLog,
    OrganizationInvitation,
    OrganizationJoinRequest,
    OrganizationMembership,
    OrganizationVerification,
    OrganizationVerificationEvent,
)
from .services import approve_verification, reject_verification


class MembershipInline(admin.TabularInline):
    model = OrganizationMembership
    extra = 0
    autocomplete_fields = ("user",)
    fields = ("user", "role", "status", "title", "department", "student_id")


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "slug",
        "org_type",
        "verification_status",
        "plan_tier",
        "tier",
        "subscription_status",
        "seat_limit",
        "is_active",
        "created_at",
    )
    list_filter = (
        "org_type",
        "verification_status",
        "plan_tier",
        "subscription_status",
        "auto_join_domain",
        "is_active",
    )
    search_fields = ("name", "slug", "domain", "owner__username", "owner__email")
    autocomplete_fields = ("owner",)
    prepopulated_fields = {"slug": ("name",)}
    inlines = [MembershipInline]
    readonly_fields = ("created_at", "updated_at", "verified_at")


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "role", "status", "joined_at")
    list_filter = ("role", "status")
    search_fields = ("organization__name", "user__username", "user__email")
    autocomplete_fields = ("organization", "user", "invited_by")


@admin.register(OrganizationInvitation)
class OrganizationInvitationAdmin(admin.ModelAdmin):
    list_display = ("organization", "email", "role", "expires_at", "accepted_at", "created_at")
    list_filter = ("role", "accepted_at", "revoked_at")
    search_fields = ("email", "organization__name")
    autocomplete_fields = ("organization", "invited_by", "accepted_by")
    readonly_fields = ("token", "created_at")


class VerificationAdminForm(forms.ModelForm):
    decision = forms.ChoiceField(
        choices=(
            ("", "Keep current status"),
            ("approve", "Approve and verify"),
            ("reject", "Reject with note"),
        ),
        required=False,
        help_text="Reviewing here sends the organization an email and writes an audit event.",
    )
    review_note = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        help_text="Required when rejecting. Shown to the organization in the email.",
    )

    class Meta:
        model = OrganizationVerification
        fields = "__all__"


@admin.register(OrganizationVerification)
class OrganizationVerificationAdmin(admin.ModelAdmin):
    form = VerificationAdminForm
    list_display = (
        "organization",
        "organization_status",
        "official_email",
        "email_confirmed",
        "submitted_at",
        "attempt",
    )
    list_filter = ("organization__verification_status", "org_type", "is_government_funded")
    search_fields = (
        "organization__name",
        "organization__slug",
        "legal_name",
        "official_email",
        "registration_number",
    )
    autocomplete_fields = ("organization",)
    readonly_fields = (
        "organization",
        "official_email_token",
        "official_email_verified_at",
        "submitted_at",
        "reviewed_at",
        "reviewed_by",
        "rejection_reason",
        "attempt",
        "document_preview",
        "created_at",
        "updated_at",
    )
    fieldsets = (
        (
            "Institution",
            {
                "fields": (
                    "organization",
                    "legal_name",
                    "org_type",
                    "country",
                    "address",
                    "website",
                    "is_government_funded",
                    "head_of_institution",
                )
            },
        ),
        (
            "Official contact",
            {
                "fields": (
                    "official_email",
                    "official_email_verified_at",
                    "official_email_token",
                    "contact_name",
                    "contact_role",
                    "contact_email",
                    "contact_phone",
                )
            },
        ),
        (
            "Registration evidence",
            {
                "fields": (
                    "registration_number",
                    "registration_document",
                    "document_preview",
                )
            },
        ),
        (
            "Review",
            {
                "fields": (
                    "decision",
                    "review_note",
                    "submitted_at",
                    "reviewed_at",
                    "reviewed_by",
                    "rejection_reason",
                    "attempt",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "organization", "reviewed_by"
        )

    @admin.display(description="Status")
    def organization_status(self, obj):
        return obj.organization.verification_status

    @admin.display(description="Verified")
    def email_confirmed(self, obj):
        return bool(obj.official_email_verified_at)

    @admin.display(description="Document")
    def document_preview(self, obj):
        if not obj.registration_document:
            return "No document uploaded"
        return format_html(
            '<a href="/api/organizations/{}/verification/document/" target="_blank" rel="noopener">'
            "Download private document</a>",
            obj.organization.slug,
        )

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        decision = form.cleaned_data.get("decision")
        note = (form.cleaned_data.get("review_note") or "").strip()
        if decision == "reject" and not note:
            # The admin form cannot easily raise from save_model; the message is
            # clear and the object remains in review until a note is supplied.
            self.message_user(
                request,
                "A rejection note is required. Nothing was changed.",
                level=messages.ERROR,
            )
            return
        if decision in ("approve", "reject"):
            super().save_model(request, obj, form, change)
            if decision == "approve":
                approve_verification(obj, request.user, note)
                self.message_user(request, f"{obj.organization.name} is now verified.")
            else:
                reject_verification(obj, request.user, note)
                self.message_user(request, f"{obj.organization.name} was rejected.")
            return
        super().save_model(request, obj, form, change)


@admin.register(OrganizationVerificationEvent)
class OrganizationVerificationEventAdmin(admin.ModelAdmin):
    list_display = ("organization", "action", "actor", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("organization__name", "actor__username", "note")
    readonly_fields = ("organization", "actor", "action", "note", "metadata", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(OrganizationJoinRequest)
class OrganizationJoinRequestAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "user",
        "status",
        "reviewed_by",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = (
        "organization__name",
        "user__username",
        "user__email",
        "message",
    )
    autocomplete_fields = ("organization", "user", "reviewed_by")
    readonly_fields = ("created_at", "updated_at", "reviewed_at")


@admin.register(OrganizationAuditLog)
class OrganizationAuditLogAdmin(admin.ModelAdmin):
    list_display = ("organization", "action", "actor", "target_type", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("organization__name", "actor__username", "action", "target_id")
    readonly_fields = (
        "organization",
        "actor",
        "action",
        "target_type",
        "target_id",
        "metadata",
        "created_at",
    )

    def has_add_permission(self, request):
        return False
