from django.contrib import admin

from .models import Room, RoomMember, RoomMessage


class RoomMemberInline(admin.TabularInline):
    model = RoomMember
    extra = 0
    readonly_fields = ("joined_at",)


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "topic", "created_by", "created_at")
    search_fields = ("name", "topic")
    list_filter = ("created_at",)
    inlines = [RoomMemberInline]


@admin.register(RoomMessage)
class RoomMessageAdmin(admin.ModelAdmin):
    list_display = ("room", "sender", "short_content", "created_at")
    list_filter = ("created_at",)
    search_fields = ("content", "sender__username", "room__name")

    @admin.display(description="Message")
    def short_content(self, obj):
        return obj.content[:60]
