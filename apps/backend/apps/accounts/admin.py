from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

from .models import Follow, Profile

User = get_user_model()


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "is_staff", "is_active", "date_joined")
    search_fields = ("username", "email")
    list_filter = ("is_staff", "is_active", "is_superuser")
    actions = [
        "deactivate_users",
        "reactivate_users",
        "award_teacher",
        "award_solver",
        "award_collaborator",
    ]

    @admin.action(description="Deactivate selected users (block login)")
    def deactivate_users(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f"Deactivated {updated} user(s).")

    @admin.action(description="Reactivate selected users")
    def reactivate_users(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"Reactivated {updated} user(s).")

    @admin.action(description="Award badge: Teacher")
    def award_teacher(self, request, queryset):
        from apps.gamification.services import award_badge

        count = sum(1 for user in queryset if award_badge(user, "teacher", actor=request.user))
        self.message_user(request, f"Awarded Teacher to {count} user(s) (already-held were skipped).")

    @admin.action(description="Award badge: Solver")
    def award_solver(self, request, queryset):
        from apps.gamification.services import award_badge

        count = sum(1 for user in queryset if award_badge(user, "solver", actor=request.user))
        self.message_user(request, f"Awarded Solver to {count} user(s) (already-held were skipped).")

    @admin.action(description="Award badge: Collaborator")
    def award_collaborator(self, request, queryset):
        from apps.gamification.services import award_badge

        count = sum(1 for user in queryset if award_badge(user, "collaborator", actor=request.user))
        self.message_user(request, f"Awarded Collaborator to {count} user(s) (already-held were skipped).")


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "post_count", "followers_count", "following_count", "badge_count", "created_at")
    search_fields = ("user__username", "user__email", "bio")
    list_filter = ("created_at",)
    readonly_fields = ("post_count", "followers_count", "following_count", "badge_count", "created_at", "updated_at")


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("follower", "followed", "created_at")
    search_fields = ("follower__username", "followed__username")
    list_filter = ("created_at",)
    autocomplete_fields = ("follower", "followed")
