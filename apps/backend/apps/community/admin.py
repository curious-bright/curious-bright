from django.contrib import admin

from .models import Comment, Equation, HelpfulReaction, Like, Notification, Post


class EquationInline(admin.TabularInline):
    model = Equation
    extra = 0


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "subject", "kind", "is_solved", "like_count", "comment_count", "created_at")
    list_filter = ("subject", "kind", "is_solved", "created_at")
    search_fields = ("title", "body", "author__username")
    inlines = [EquationInline]
    autocomplete_fields = ("author",)
    actions = ["mark_solved", "mark_unsolved"]

    @admin.action(description="Mark selected posts solved")
    def mark_solved(self, request, queryset):
        queryset.update(is_solved=True)

    @admin.action(description="Mark selected posts unsolved")
    def mark_unsolved(self, request, queryset):
        queryset.update(is_solved=False)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("post", "author", "is_accepted", "helpful_count", "created_at")
    list_filter = ("is_accepted", "created_at")
    search_fields = ("body", "author__username", "post__title")
    autocomplete_fields = ("author", "post", "parent")


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
