from django.contrib import admin

from .models import Collaboration, ResearchDocument, ResearchDocumentRevision


class CollaborationInline(admin.TabularInline):
    model = Collaboration
    extra = 0
    autocomplete_fields = ("user",)


@admin.register(ResearchDocument)
class ResearchDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "field", "status", "updated_at")
    list_filter = ("status", "field", "updated_at")
    search_fields = ("title", "abstract", "body", "owner__username")
    autocomplete_fields = ("owner",)
    inlines = [CollaborationInline]


@admin.register(Collaboration)
class CollaborationAdmin(admin.ModelAdmin):
    list_display = ("document", "user", "role", "status", "invited_by", "created_at")
    list_filter = ("status", "role", "created_at")
    search_fields = ("document__title", "user__username")
    autocomplete_fields = ("document", "user", "invited_by")
    actions = ["accept_invites", "decline_invites"]

    @admin.action(description="Accept selected invitations")
    def accept_invites(self, request, queryset):
        updated = queryset.update(status=Collaboration.Status.ACCEPTED)
        self.message_user(request, f"Accepted {updated} invitation(s).")

    @admin.action(description="Decline selected invitations")
    def decline_invites(self, request, queryset):
        updated = queryset.update(status=Collaboration.Status.DECLINED)
        self.message_user(request, f"Declined {updated} invitation(s).")


@admin.register(ResearchDocumentRevision)
class RevisionAdmin(admin.ModelAdmin):
    list_display = ("document", "editor", "summary", "created_at")
    search_fields = ("document__title", "editor__username", "summary")
    list_filter = ("created_at",)
    autocomplete_fields = ("document", "editor")
