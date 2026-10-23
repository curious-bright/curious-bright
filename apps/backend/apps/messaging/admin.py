from django.contrib import admin
from django.utils import timezone

from .models import Conversation, Message, MessageReport, UserBlock


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    can_delete = False
    fields = ("sender", "body", "created_at", "read_at", "deleted_at")
    readonly_fields = ("sender", "body", "created_at", "read_at", "deleted_at")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "user_a", "user_b", "created_at", "updated_at")
    search_fields = ("user_a__username", "user_b__username")
    autocomplete_fields = ("user_a", "user_b")
    inlines = [MessageInline]
    readonly_fields = ("created_at", "updated_at")

    def has_add_permission(self, request):
        # Conversations are created by members through the privacy-checked API.
        return False


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "short_body", "created_at", "read_at", "deleted_at")
    list_filter = ("created_at", "read_at", "deleted_at")
    search_fields = ("sender__username", "conversation__user_a__username", "conversation__user_b__username")
    autocomplete_fields = ("conversation", "sender")
    readonly_fields = ("conversation", "sender", "body", "client_id", "created_at", "read_at", "deleted_at", "deleted_by")
    date_hierarchy = "created_at"

    @admin.display(description="Message")
    def short_body(self, obj):
        if obj.deleted_at:
            return "deleted"
        return obj.body[:80]

    def has_add_permission(self, request):
        return False


@admin.register(UserBlock)
class UserBlockAdmin(admin.ModelAdmin):
    list_display = ("blocker", "blocked", "created_at")
    search_fields = ("blocker__username", "blocked__username")
    autocomplete_fields = ("blocker", "blocked")
    readonly_fields = ("created_at",)


@admin.register(MessageReport)
class MessageReportAdmin(admin.ModelAdmin):
    list_display = ("id", "reporter", "message_sender", "status", "created_at", "reviewed_by")
    list_filter = ("status", "created_at")
    search_fields = ("reporter__username", "message__sender__username", "reason")
    autocomplete_fields = ("message", "reporter", "reviewed_by")
    readonly_fields = ("message", "reporter", "reason", "created_at", "reviewed_at")
    actions = ("mark_reviewed", "mark_dismissed")

    @admin.display(description="Sender")
    def message_sender(self, obj):
        return obj.message.sender.username

    def _set_status(self, request, queryset, status_value):
        queryset.update(
            status=status_value,
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
        )

    @admin.action(description="Mark selected reports reviewed")
    def mark_reviewed(self, request, queryset):
        self._set_status(request, queryset, MessageReport.Status.REVIEWED)

    @admin.action(description="Dismiss selected reports")
    def mark_dismissed(self, request, queryset):
        self._set_status(request, queryset, MessageReport.Status.DISMISSED)
