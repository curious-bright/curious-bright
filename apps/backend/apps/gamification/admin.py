from django.contrib import admin

from .models import Badge, UserBadge
from .services import award_badge, revoke_badge


@admin.register(Badge)
class BadgeAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "active", "created_at")
    list_filter = ("active",)
    search_fields = ("name", "code", "description")
    prepopulated_fields = {"code": ("name",)}


@admin.register(UserBadge)
class UserBadgeAdmin(admin.ModelAdmin):
    list_display = ("user", "badge", "awarded_by", "awarded_at")
    list_filter = ("badge", "awarded_at")
    search_fields = ("user__username", "badge__code")
    autocomplete_fields = ("user", "badge")
    actions = ["revoke_selected"]

    @admin.action(description="Revoke selected badges")
    def revoke_selected(self, request, queryset):
        count = 0
        for ub in queryset:
            if revoke_badge(ub.user, ub.badge.code):
                count += 1
        self.message_user(request, f"Revoked {count} badge(s).")
