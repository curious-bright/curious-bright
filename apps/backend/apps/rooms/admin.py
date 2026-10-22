from django.contrib import admin

from apps.core.models import ContentAuditLog
from .models import Room, RoomMember, RoomMessage


class RoomMemberInline(admin.TabularInline):
    model = RoomMember
    extra = 0
    readonly_fields = ("joined_at",)


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "topic", "created_by", "organization", "is_deleted", "created_at")
    search_fields = ("name", "topic", "created_by__username")
    list_filter = ("topic", "is_deleted", "created_at")
    inlines = [RoomMemberInline]
    actions = ["restore_selected_rooms"]

    def get_queryset(self, request):
        return Room.all_objects.all()

    @admin.action(description="Restore selected soft-deleted study rooms")
    def restore_selected_rooms(self, request, queryset):
        count = 0
        for room in queryset.filter(is_deleted=True):
            room.restore()
            ContentAuditLog.objects.create(
                actor=request.user,
                action=ContentAuditLog.Action.RESTORE,
                content_type="room",
                object_id=str(room.pk),
                object_repr=str(room),
                reason="Restored via Django Admin",
            )
            count += 1
        self.message_user(request, f"Restored {count} study room(s).")


@admin.register(RoomMessage)
class RoomMessageAdmin(admin.ModelAdmin):
    list_display = ("room", "sender", "short_content", "created_at")
    list_filter = ("created_at",)
    search_fields = ("content", "sender__username", "room__name")

    @admin.display(description="Message")
    def short_content(self, obj):
        return obj.content[:60]
