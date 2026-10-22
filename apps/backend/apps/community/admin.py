from django.contrib import admin

from apps.core.models import ContentAuditLog
from .models import Comment, Equation, HelpfulReaction, Like, Notification, Post


class EquationInline(admin.TabularInline):
    model = Equation
    extra = 0


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "author",
        "subject",
        "kind",
        "visibility",
        "is_solved",
        "is_deleted",
        "like_count",
        "comment_count",
        "created_at",
    )
    list_filter = ("subject", "kind", "visibility", "is_solved", "is_deleted", "created_at")
    search_fields = ("title", "body", "author__username")
    inlines = [EquationInline]
    autocomplete_fields = ("author",)
    actions = ["mark_solved", "mark_unsolved", "restore_selected_posts"]

    def get_queryset(self, request):
        return Post.all_objects.all()

    @admin.action(description="Mark selected posts solved")
    def mark_solved(self, request, queryset):
        queryset.update(is_solved=True)

    @admin.action(description="Mark selected posts unsolved")
    def mark_unsolved(self, request, queryset):
        queryset.update(is_solved=False)

    @admin.action(description="Restore selected soft-deleted posts")
    def restore_selected_posts(self, request, queryset):
        count = 0
        for post in queryset.filter(is_deleted=True):
            post.restore()
            ContentAuditLog.objects.create(
                actor=request.user,
                action=ContentAuditLog.Action.RESTORE,
                content_type="post",
                object_id=str(post.pk),
                object_repr=str(post),
                reason="Restored via Django Admin",
            )
            count += 1
        self.message_user(request, f"Restored {count} soft-deleted post(s).")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("post", "author", "is_accepted", "is_deleted", "helpful_count", "created_at")
    list_filter = ("is_accepted", "is_deleted", "created_at")
    search_fields = ("body", "author__username", "post__title")
    autocomplete_fields = ("author", "post", "parent")
    actions = ["restore_selected_comments"]

    def get_queryset(self, request):
        return Comment.all_objects.all()

    @admin.action(description="Restore selected soft-deleted comments")
    def restore_selected_comments(self, request, queryset):
        count = 0
        for comment in queryset.filter(is_deleted=True):
            comment.restore()
            ContentAuditLog.objects.create(
                actor=request.user,
                action=ContentAuditLog.Action.RESTORE,
                content_type="comment",
                object_id=str(comment.pk),
                object_repr=str(comment),
                reason="Restored via Django Admin",
            )
            count += 1
        self.message_user(request, f"Restored {count} soft-deleted comment(s).")


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("user", "post", "created_at")
    search_fields = ("user__username", "post__title")


@admin.register(HelpfulReaction)
class HelpfulReactionAdmin(admin.ModelAdmin):
    list_display = ("user", "comment", "created_at")
    search_fields = ("user__username", "comment__body")


@admin.register(Equation)
class EquationAdmin(admin.ModelAdmin):
    list_display = ("latex", "post", "created_by", "created_at")
    search_fields = ("latex", "description")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "verb", "actor", "is_read", "created_at")
    list_filter = ("verb", "is_read", "created_at")
    search_fields = ("user__username", "actor__username", "text")
    autocomplete_fields = ("user", "actor")
