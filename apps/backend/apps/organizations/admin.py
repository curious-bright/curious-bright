from django.contrib import admin

from .models import (
    Organization,
    OrganizationAuditLog,
    OrganizationInvitation,
    OrganizationMembership,
)


class MembershipInline(admin.TabularInline):
    model = OrganizationMembership
    extra = 0
    autocomplete_fields = ("user",)
    fields = ("user", "role", "status", "title", "department", "student_id")


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = (
        "name", "slug", "org_type", "plan_tier", "tier", "subscription_status", "seat_limit", "is_active", "created_at"
    )
    list_filter = ("org_type", "plan_tier", "subscription_status", "auto_join_domain", "is_active")
    search_fields = ("name", "slug", "domain", "owner__username", "owner__email")
    autocomplete_fields = ("owner",)
    prepopulated_fields = {"slug": ("name",)}
    inlines = [MembershipInline]
    readonly_fields = ("created_at", "updated_at")


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


@admin.register(OrganizationAuditLog)
class OrganizationAuditLogAdmin(admin.ModelAdmin):
    list_display = ("organization", "action", "actor", "target_type", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("organization__name", "actor__username", "action", "target_id")
    readonly_fields = (
        "organization", "actor", "action", "target_type", "target_id", "metadata", "created_at"
    )

    def has_add_permission(self, request):
        return False
