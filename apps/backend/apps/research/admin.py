from django.contrib import admin

from apps.core.models import ContentAuditLog
from .models import Collaboration, ResearchDocument, ResearchDocumentRevision


class CollaborationInline(admin.TabularInline):
    model = Collaboration
    extra = 0
    autocomplete_fields = ("user",)


@admin.register(ResearchDocument)
class ResearchDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "field", "status", "organization", "is_deleted", "updated_at")
    list_filter = ("status", "field", "is_deleted", "updated_at")
    search_fields = ("title", "abstract", "body", "owner__username")
    autocomplete_fields = ("owner",)
    inlines = [CollaborationInline]
    actions = ["restore_selected_documents"]

    def get_queryset(self, request):
        return ResearchDocument.all_objects.all()

    @admin.action(description="Restore selected soft-deleted research documents")
    def restore_selected_documents(self, request, queryset):
        count = 0
        for doc in queryset.filter(is_deleted=True):
            doc.restore()
            ContentAuditLog.objects.create(
                actor=request.user,
                action=ContentAuditLog.Action.RESTORE,
                content_type="research_document",
                object_id=str(doc.pk),
                object_repr=str(doc),
                reason="Restored via Django Admin",
            )
            count += 1
        self.message_user(request, f"Restored {count} research document(s).")


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
