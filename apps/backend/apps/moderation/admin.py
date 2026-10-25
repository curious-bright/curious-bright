from django.contrib import admin
from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import ModeratorApplication, Report
from .services import notify_application_decision

User = get_user_model()


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("post_title", "reporter", "is_resolved", "created_at")
    list_filter = ("is_resolved", "created_at")
    search_fields = ("reason", "post__title", "reporter__username")
    raw_id_fields = ("post", "reporter", "resolved_by")
    readonly_fields = ("created_at", "resolved_at")

    @admin.display(description="Post")
    def post_title(self, obj):
        return obj.post.title

    @admin.action(description="Mark selected reports resolved")
    def resolve_reports(self, request, queryset):
        updated = queryset.filter(is_resolved=False).update(
            is_resolved=True,
            resolved_by=request.user,
            resolved_at=timezone.now(),
        )
        self.message_user(request, f"{updated} report(s) marked resolved.")


@admin.register(ModeratorApplication)
class ModeratorApplicationAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "subjects_display", "created_at", "updated_at")
    list_filter = ("status", "created_at")
    search_fields = ("user__username", "user__email", "motivation")
    readonly_fields = ("created_at", "updated_at", "reviewed_by")
    actions = ["approve_applications", "decline_applications"]

    @admin.display(description="Subjects")
    def subjects_display(self, obj):
        return ", ".join(obj.subjects or [])

    @admin.action(description="Approve selected applications (grant moderator role)")
    def approve_applications(self, request, queryset):
        updated = 0
        for application in queryset.filter(status=ModeratorApplication.Status.PENDING):
            application.status = ModeratorApplication.Status.APPROVED
            application.reviewed_by = request.user
            application.review_note = "Approved from the admin review queue."
            application.save(
                update_fields=["status", "reviewed_by", "review_note", "updated_at"]
            )
            User.objects.filter(pk=application.user_id).update(is_moderator=True)
            notify_application_decision(
                application, request.user, True, application.review_note
            )
            updated += 1
        self.message_user(request, f"{updated} application(s) approved; moderator role granted.")

    @admin.action(description="Decline selected applications")
    def decline_applications(self, request, queryset):
        updated = 0
        for application in queryset.filter(status=ModeratorApplication.Status.PENDING):
            application.status = ModeratorApplication.Status.REJECTED
            application.reviewed_by = request.user
            application.review_note = "Declined from the admin review queue."
            application.save(
                update_fields=["status", "reviewed_by", "review_note", "updated_at"]
            )
            notify_application_decision(
                application, request.user, False, application.review_note
            )
            updated += 1
        self.message_user(request, f"{updated} application(s) declined.")
