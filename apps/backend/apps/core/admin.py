"""Admin dashboard: branding extras and the analytics overview callback."""

from datetime import timedelta

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.db.models import Count
from django.db.models.functions import TruncDate
from django.urls import reverse
from django.utils import timezone

from apps.community.models import Comment, Post
from apps.gamification.models import Badge, UserBadge
from apps.moderation.models import ModeratorApplication, Report
from apps.research.models import ResearchDocument
from apps.rooms.models import Room, RoomMessage
from .models import ContentAuditLog

admin.site.index_template = "admin/curious_index.html"


@admin.register(ContentAuditLog)
class ContentAuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "content_type", "object_id", "object_repr", "actor", "created_at")
    list_filter = ("action", "content_type", "created_at")
    search_fields = ("object_id", "object_repr", "reason", "actor__username")
    readonly_fields = ("action", "content_type", "object_id", "object_repr", "actor", "reason", "metadata", "created_at")

    def has_add_permission(self, request):
        return False


def _list_url(model, query=""):
    return reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist") + query


def _change_url(obj):
    model = type(obj)
    return reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_change", args=[obj.pk])


def _delta_note(current, previous):
    if previous == 0:
        return (f"{current} this week", "neutral") if current else ("No activity yet", "neutral")
    change = round((current - previous) / previous * 100)
    if change == 0:
        return "No change vs last week", "neutral"
    return f"{change:+d}% vs last week", "up" if change > 0 else "down"


def _panel(title, rows, empty_text):
    return {"title": title, "rows": rows, "empty_text": empty_text}


def _activity(now):
    start = (now - timedelta(days=13)).date()
    member_rows = (
        get_user_model()
        .objects.filter(date_joined__date__gte=start)
        .annotate(day=TruncDate("date_joined"))
        .values("day")
        .annotate(n=Count("id"))
    )
    post_rows = (
        Post.objects.filter(created_at__date__gte=start)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(n=Count("id"))
    )
    members = {row["day"]: row["n"] for row in member_rows}
    posts = {row["day"]: row["n"] for row in post_rows}

    days = []
    peak = 1
    for offset in range(14):
        day = start + timedelta(days=offset)
        m, p = members.get(day, 0), posts.get(day, 0)
        peak = max(peak, m, p)
        days.append({"date": day, "label": day.strftime("%d"), "full": day.strftime("%a %d %b"), "members": m, "posts": p})

    for entry in days:
        entry["member_pct"] = round(entry["members"] / peak * 100, 1)
        entry["post_pct"] = round(entry["posts"] / peak * 100, 1)
    return {"days": days, "peak": peak}


def _dashboard_stats():
    User = get_user_model()
    now = timezone.now()
    week_ago = now - timedelta(days=7)
    prev_week = now - timedelta(days=14)

    total_posts = Post.objects.count()
    published = Post.objects.filter(review_status=Post.ReviewStatus.PUBLISHED).count()
    pending = Post.objects.filter(review_status=Post.ReviewStatus.PENDING).count()
    rejected = Post.objects.filter(review_status=Post.ReviewStatus.REJECTED).count()

    def pct(part, whole):
        return round(part / whole * 100, 1) if whole else 0.0

    pub_pct = pct(published, total_posts)
    pend_pct = pct(pending, total_posts)

    reports_open = Report.objects.filter(is_resolved=False).count()
    apps_pending = ModeratorApplication.objects.filter(status=ModeratorApplication.Status.PENDING).count()

    cards = [
        {
            "label": "Members",
            "value": User.objects.count(),
            "icon": "group",
            "url": _list_url(User),
            "note": _delta_note(User.objects.filter(date_joined__gte=week_ago).count(), User.objects.filter(date_joined__gte=prev_week, date_joined__lt=week_ago).count())[0],
        },
        {
            "label": "Posts",
            "value": total_posts,
            "icon": "article",
            "url": _list_url(Post),
            "note": _delta_note(Post.objects.filter(created_at__gte=week_ago).count(), Post.objects.filter(created_at__gte=prev_week, created_at__lt=week_ago).count())[0],
        },
        {
            "label": "Open reports",
            "value": reports_open,
            "icon": "flag",
            "url": _list_url(Report, "?is_resolved__exact=0"),
            "note": f"{Report.objects.count()} filed in total" if reports_open else "Nothing to review",
            "tone": "warn" if reports_open else "good",
        },
        {
            "label": "Pending applications",
            "value": apps_pending,
            "icon": "how_to_reg",
            "url": _list_url(ModeratorApplication, "?status__exact=pending"),
            "note": f"{ModeratorApplication.objects.count()} submitted in total",
            "tone": "warn" if apps_pending else "good",
        },
        {
            "label": "Study rooms",
            "value": Room.objects.count(),
            "icon": "meeting_room",
            "url": _list_url(Room),
            "note": f"{RoomMessage.objects.count()} messages",
        },
        {
            "label": "Comments",
            "value": Comment.objects.count(),
            "icon": "forum",
            "url": _list_url(Comment),
            "note": f"{Post.objects.filter(is_solved=True).count()} solved posts",
        },
        {
            "label": "Research documents",
            "value": ResearchDocument.objects.count(),
            "icon": "science",
            "url": _list_url(ResearchDocument),
            "note": f"{ResearchDocument.objects.filter(status=ResearchDocument.Status.PUBLISHED).count()} published",
        },
        {
            "label": "Badges awarded",
            "value": UserBadge.objects.count(),
            "icon": "workspace_premium",
            "url": _list_url(UserBadge),
            "note": f"{Badge.objects.count()} badge types",
        },
    ]

    subject_rows = list(Post.objects.values("subject").annotate(n=Count("id")).order_by("-n"))
    subject_names = dict(Post.Subject.choices)
    subject_peak = max([row["n"] for row in subject_rows], default=1)
    subjects = [
        {
            "label": subject_names.get(row["subject"], row["subject"]),
            "count": row["n"],
            "pct": round(row["n"] / subject_peak * 100, 1),
        }
        for row in subject_rows
    ]

    contributors = [
        {"username": u.username, "posts": u.post_count, "url": _change_url(u)}
        for u in User.objects.annotate(post_count=Count("posts")).filter(post_count__gt=0).order_by("-post_count")[:6]
    ]

    panels = [
        _panel(
            "Posts awaiting review",
            [
                {
                    "label": p.title,
                    "meta": f"{p.author.username} · {p.get_subject_display()} · {timezone.localtime(p.created_at):%d %b, %H:%M}",
                    "url": _change_url(p),
                }
                for p in Post.objects.filter(review_status=Post.ReviewStatus.PENDING).select_related("author")[:5]
            ],
            "No posts waiting for review.",
        ),
        _panel(
            "Open reports",
            [
                {
                    "label": r.post.title,
                    "meta": f"{r.reason[:90]} · by {r.reporter.username}",
                    "url": _change_url(r),
                }
                for r in Report.objects.filter(is_resolved=False).select_related("post", "reporter")[:5]
            ],
            "No open reports.",
        ),
        _panel(
            "Moderator applications",
            [
                {
                    "label": a.user.username,
                    "meta": f"submitted {timezone.localtime(a.created_at):%d %b, %H:%M}",
                    "url": _change_url(a),
                }
                for a in ModeratorApplication.objects.filter(status=ModeratorApplication.Status.PENDING).select_related("user")[:5]
            ],
            "No pending applications.",
        ),
        _panel(
            "Newest members",
            [
                {
                    "label": u.username,
                    "meta": f"joined {timezone.localtime(u.date_joined):%d %b %Y}",
                    "url": _change_url(u),
                }
                for u in User.objects.order_by("-date_joined")[:5]
            ],
            "No members yet.",
        ),
    ]

    return {
        "today": timezone.localdate().strftime("%A, %d %B %Y"),
        "cards": cards,
        "activity": _activity(now),
        "status": {
            "total": total_posts,
            "published": {"count": published, "pct": pub_pct},
            "pending": {"count": pending, "pct": pend_pct},
            "rejected": {"count": rejected, "pct": round(100 - pub_pct - pend_pct, 1) if total_posts else 0.0},
            "published_end": pub_pct,
            "pending_end": round(pub_pct + pend_pct, 1),
        },
        "subjects": subjects,
        "contributors": contributors,
        "panels": panels,
        "summary": {
            "open_reports": reports_open,
            "pending_posts": pending,
            "pending_applications": apps_pending,
        },
    }


def dashboard_callback(request, context):
    context = dict(context)
    try:
        stats = _dashboard_stats()
        is_default_pass = False
        default_pwd = getattr(settings, "ADMIN_PASSWORD", None)
        if request.user.is_superuser and default_pwd:
            is_default_pass = request.user.check_password(default_pwd)
        must_change = getattr(getattr(request.user, "profile", None), "must_change_password", False)
        context["admin_security_reminder"] = is_default_pass or must_change
        context["dashboard_stats"] = stats
    except Exception as exc:  # never break the admin index on a stats hiccup
        context["dashboard_stats"] = {"error": f"Dashboard stats unavailable: {exc}"}
    return context
