"""Admin dashboard: site titles, analytics overview and recent-activity panels."""

from datetime import timedelta

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from apps.community.models import Comment, Post
from apps.gamification.models import UserBadge
from apps.moderation.models import ModeratorApplication, Report
from apps.research.models import ResearchDocument
from apps.rooms.models import Room


def _list_url(model, query=""):
    name = f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist"
    return reverse(name) + query


def _change_url(obj):
    model = type(obj)
    name = f"admin:{model._meta.app_label}_{model._meta.model_name}_change"
    return reverse(name, args=[obj.pk])


def _panel(title, rows, empty_text):
    """rows: list of dicts {label, meta, url}."""
    return {"title": title, "rows": rows, "empty_text": empty_text}


def _dashboard_stats():
    User = get_user_model()
    week_ago = timezone.now() - timedelta(days=7)

    pending_posts = Post.objects.filter(review_status=Post.ReviewStatus.PENDING).select_related("author")[:5]
    open_reports = Report.objects.filter(is_resolved=False).select_related("post", "reporter")[:5]
    pending_apps = ModeratorApplication.objects.filter(status=ModeratorApplication.Status.PENDING).select_related("user")[:5]
    recent_users = User.objects.order_by("-date_joined")[:5]

    cards = [
        {
            "label": "Members",
            "value": User.objects.count(),
            "note": f"{User.objects.filter(date_joined__gte=week_ago).count()} joined this week",
            "url": _list_url(User),
        },
        {
            "label": "Posts",
            "value": Post.objects.count(),
            "note": f"{Post.objects.filter(review_status=Post.ReviewStatus.PENDING).count()} awaiting review",
            "url": _list_url(Post, "?review_status__exact=pending"),
        },
        {
            "label": "Open reports",
            "value": Report.objects.filter(is_resolved=False).count(),
            "note": f"{Report.objects.count()} filed in total",
            "url": _list_url(Report, "?is_resolved__exact=0"),
        },
        {
            "label": "Moderator applications",
            "value": ModeratorApplication.objects.filter(status=ModeratorApplication.Status.PENDING).count(),
            "note": f"{ModeratorApplication.objects.count()} submitted in total",
            "url": _list_url(ModeratorApplication, "?status__exact=pending"),
        },
        {
            "label": "Study rooms",
            "value": Room.objects.count(),
            "note": None,
            "url": _list_url(Room),
        },
        {
            "label": "Comments",
            "value": Comment.objects.count(),
            "note": f"{Post.objects.filter(is_solved=True).count()} solved posts",
            "url": _list_url(Comment),
        },
        {
            "label": "Research documents",
            "value": ResearchDocument.objects.count(),
            "note": f"{ResearchDocument.objects.filter(status=ResearchDocument.Status.PUBLISHED).count()} published",
            "url": _list_url(ResearchDocument),
        },
        {
            "label": "Badges awarded",
            "value": UserBadge.objects.count(),
            "note": None,
            "url": _list_url(UserBadge),
        },
    ]

    panels = [
        _panel(
            "Posts awaiting review",
            [
                {
                    "label": p.title,
                    "meta": f"{p.author.username} · {p.get_subject_display()} · {p.created_at:%b %d, %H:%M} UTC",
                    "url": _change_url(p),
                }
                for p in pending_posts
            ],
            "No posts are waiting for review.",
        ),
        _panel(
            "Open reports",
            [
                {
                    "label": r.post.title,
                    "meta": f"{r.reason[:80]} · by {r.reporter.username}",
                    "url": _change_url(r),
                }
                for r in open_reports
            ],
            "No open reports.",
        ),
        _panel(
            "Moderator applications",
            [
                {
                    "label": a.user.username,
                    "meta": f"submitted {a.created_at:%b %d, %H:%M} UTC",
                    "url": _change_url(a),
                }
                for a in pending_apps
            ],
            "No pending applications.",
        ),
        _panel(
            "Newest members",
            [
                {
                    "label": u.username,
                    "meta": f"joined {u.date_joined:%b %d, %Y}",
                    "url": _change_url(u),
                }
                for u in recent_users
            ],
            "No members yet.",
        ),
    ]
    return {"cards": cards, "panels": panels}


def _safe_dashboard_stats():
    try:
        return _dashboard_stats()
    except Exception as exc:  # never break the admin on a stats hiccup
        return {"error": f"Dashboard stats unavailable: {exc}", "cards": [], "panels": []}


_original_index = admin.site.index


def _dashboard_index(request, extra_context=None):
    context = dict(extra_context or {})
    context.setdefault("dashboard_stats", _safe_dashboard_stats())
    return _original_index(request, extra_context=context)


admin.site.index = _dashboard_index
admin.site.index_template = "admin/curious_index.html"
admin.site.site_header = "Curious Bright Administration"
admin.site.site_title = "Curious Bright Admin"
admin.site.index_title = "Overview"
