"""Staff-only analytics dashboard built entirely from local PostgreSQL data.

Privacy rules:
- Never select or display private message bodies, chat content, or search text.
- Only aggregate counts, durations, statuses and organization-level activity.
- Results are cached briefly so the page stays fast under admin polling.
"""

from __future__ import annotations

import csv
from datetime import date, datetime, timedelta

from django.contrib import admin
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.shortcuts import render
from django.utils import timezone

from apps.accounts.models import Follow, User, UserActivity
from apps.billing.models import OrganizationSubscription
from apps.community.models import Comment, Like, Post
from apps.core.models import ContentAuditLog
from apps.gamification.models import UserBadge
from apps.messaging.models import Conversation, MessageReport
from apps.moderation.models import Report
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    OrganizationVerification,
)
from apps.rooms.models import Room, VideoSession

CACHE_SECONDS = 300
MAX_RANGE_DAYS = 366


def can_view_analytics(user_or_request) -> bool:
    """Permission check used by both the views and Unfold's nav callback.

    Unfold calls navigation ``permission`` callbacks with the request, while the
    analytics views pass ``request.user``. Accept either shape so the sidebar
    link and the page cannot drift apart.
    """
    user = getattr(user_or_request, "user", user_or_request)
    return bool(
        user
        and user.is_active
        and user.is_staff
        and (user.is_superuser or user.has_perm("core.view_analytics"))
    )


def _parse_range(request):
    today = timezone.localdate()
    default_start = today - timedelta(days=29)
    raw_start = (request.GET.get("start") or "").strip()
    raw_end = (request.GET.get("end") or "").strip()
    try:
        end = date.fromisoformat(raw_end) if raw_end else today
    except ValueError:
        end = today
    try:
        start = date.fromisoformat(raw_start) if raw_start else default_start
    except ValueError:
        start = default_start
    if start > end:
        start, end = end, start
    if (end - start).days > MAX_RANGE_DAYS:
        start = end - timedelta(days=MAX_RANGE_DAYS)
    return start, end


def _cache_key(start, end):
    return f"cb:admin:analytics:v1:{start.isoformat()}:{end.isoformat()}"


def _daily_rows(queryset, field, start, end):
    lookup = f"{field}__range" if field == "date" else f"{field}__date__range"
    return (
        queryset.filter(**{lookup: (start, end)})
        .annotate(day=TruncDate(field))
        .values("day")
        .annotate(total=Count("id"))
        .order_by("day")
    )


def _fill_daily(rows, start, end):
    counts = {row["day"]: row["total"] for row in rows}
    labels, values = [], []
    cursor = start
    while cursor <= end:
        labels.append(cursor.isoformat())
        values.append(counts.get(cursor, 0))
        cursor += timedelta(days=1)
    return {"labels": labels, "values": values}


def _status_counts():
    labels = dict(Organization.VerificationStatus.choices)
    counts = {
        row["verification_status"]: row["total"]
        for row in Organization.objects.values("verification_status").annotate(
            total=Count("id")
        )
    }
    return [
        {"key": key, "label": label, "value": counts.get(key, 0)}
        for key, label in labels.items()
    ]


def _type_counts():
    labels = dict(Organization.OrgType.choices)
    counts = {
        row["org_type"]: row["total"]
        for row in Organization.objects.values("org_type").annotate(total=Count("id"))
    }
    return [
        {"key": key, "label": label, "value": counts.get(key, 0)}
        for key, label in labels.items()
    ]


def _country_counts():
    return list(
        Organization.objects.exclude(country="")
        .values("country")
        .annotate(total=Count("id"))
        .order_by("-total", "country")[:10]
    )


def _average_verification_seconds():
    rows = OrganizationVerification.objects.filter(
        submitted_at__isnull=False,
        organization__verified_at__isnull=False,
    ).values_list("submitted_at", "organization__verified_at")
    seconds = []
    for submitted, verified in rows:
        if submitted and verified and verified >= submitted:
            seconds.append((verified - submitted).total_seconds())
    return round(sum(seconds) / len(seconds), 0) if seconds else None


def _top_organizations(start, end):
    rows = (
        Organization.objects.annotate(
            post_count=Count(
                "posts",
                filter=Q(posts__created_at__date__range=(start, end)),
                distinct=True,
            ),
            room_count=Count(
                "rooms",
                filter=Q(rooms__created_at__date__range=(start, end)),
                distinct=True,
            ),
            member_count=Count(
                "memberships",
                filter=Q(memberships__status=OrganizationMembership.Status.ACTIVE),
                distinct=True,
            ),
            student_count=Count(
                "memberships",
                filter=Q(
                    memberships__status=OrganizationMembership.Status.ACTIVE,
                    memberships__role=OrganizationMembership.Role.STUDENT,
                ),
                distinct=True,
            ),
        )
        .order_by("-post_count", "-room_count", "-member_count", "name")[:10]
    )
    result = []
    for org in rows:
        result.append(
            {
                "name": org.name,
                "slug": org.slug,
                "status": org.get_verification_status_display(),
                "posts": org.post_count,
                "rooms": org.room_count,
                "members": org.member_count,
                "students": org.student_count,
                "score": org.post_count * 3 + org.room_count * 2 + org.member_count,
            }
        )
    return sorted(result, key=lambda row: (-row["score"], row["name"]))[:8]


def _expiring_subscriptions(now, days=30):
    queryset = OrganizationSubscription.objects.filter(
        status=OrganizationSubscription.Status.ACTIVE,
        current_period_end__isnull=False,
        current_period_end__gte=now,
        current_period_end__lte=now + timedelta(days=days),
    )
    rows = list(
        queryset.select_related("organization").order_by("current_period_end")[:10]
    )
    return rows, queryset.count()


def collect_metrics(start, end):
    now = timezone.now()
    org_signups = _fill_daily(
        _daily_rows(Organization.objects.all(), "created_at", start, end),
        start,
        end,
    )
    new_users = _fill_daily(
        _daily_rows(User.objects.all(), "date_joined", start, end),
        start,
        end,
    )
    active_users = _fill_daily(
        _daily_rows(UserActivity.objects.all(), "date", start, end),
        start,
        end,
    )

    verifications = OrganizationVerification.objects.all()
    funnel = {
        "submitted": verifications.filter(submitted_at__isnull=False).count(),
        "email_confirmed": verifications.filter(
            official_email_verified_at__isnull=False
        ).count(),
        "pending_review": Organization.objects.filter(
            verification_status=Organization.VerificationStatus.PENDING_REVIEW
        ).count(),
        "verified": Organization.objects.filter(
            verification_status=Organization.VerificationStatus.VERIFIED
        ).count(),
        "rejected": Organization.objects.filter(
            verification_status=Organization.VerificationStatus.REJECTED
        ).count(),
    }

    active_subscriptions = OrganizationSubscription.objects.filter(
        status=OrganizationSubscription.Status.ACTIVE
    ).count()
    expiring, expiring_count = _expiring_subscriptions(now)

    users_in_range = User.objects.filter(date_joined__date__range=(start, end))
    verified_signups = users_in_range.filter(is_email_verified=True).count()
    unverified_signups = users_in_range.filter(is_email_verified=False).count()

    reports_in_range = Report.objects.filter(created_at__date__range=(start, end))
    message_reports_in_range = MessageReport.objects.filter(
        created_at__date__range=(start, end)
    )
    moderation_actions = (
        ContentAuditLog.objects.filter(
            created_at__date__range=(start, end),
            action__in=[
                ContentAuditLog.Action.DELETE,
                ContentAuditLog.Action.RESTORE,
                ContentAuditLog.Action.PURGE,
            ],
        ).count()
        + Report.objects.filter(resolved_at__date__range=(start, end)).count()
        + MessageReport.objects.filter(reviewed_at__date__range=(start, end)).count()
    )

    video_seconds = (
        VideoSession.objects.filter(joined_at__date__range=(start, end)).aggregate(
            total=Sum("duration_seconds")
        )["total"]
        or 0
    )

    metrics = {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "generated_at": now,
        "organizations": {
            "total": Organization.objects.count(),
            "active": Organization.objects.filter(is_active=True).count(),
            "by_status": _status_counts(),
            "pending_review": Organization.objects.filter(
                verification_status=Organization.VerificationStatus.PENDING_REVIEW
            ).count(),
            "by_type": _type_counts(),
            "by_country": _country_counts(),
            "signups": org_signups,
            "funnel": funnel,
            "average_verification_seconds": _average_verification_seconds(),
            "active_subscriptions": active_subscriptions,
            "expiring_subscriptions": [
                {
                    "organization": sub.organization.name,
                    "slug": sub.organization.slug,
                    "plan": sub.plan_code,
                    "period_end": sub.current_period_end,
                }
                for sub in expiring
            ],
            "expiring_count": expiring_count,
            "members_total": OrganizationMembership.objects.filter(
                status=OrganizationMembership.Status.ACTIVE
            ).count(),
            "students_total": OrganizationMembership.objects.filter(
                status=OrganizationMembership.Status.ACTIVE,
                role=OrganizationMembership.Role.STUDENT,
            ).count(),
            "top": _top_organizations(start, end),
        },
        "platform": {
            "new_users_total": users_in_range.count(),
            "verified_signups": verified_signups,
            "unverified_signups": unverified_signups,
            "new_users": new_users,
            "active_users": active_users,
            "dau": UserActivity.objects.filter(date=end).values("user_id").distinct().count(),
            "wau": UserActivity.objects.filter(
                date__gte=end - timedelta(days=6), date__lte=end
            )
            .values("user_id")
            .distinct()
            .count(),
            "mau": UserActivity.objects.filter(
                date__gte=end - timedelta(days=29), date__lte=end
            )
            .values("user_id")
            .distinct()
            .count(),
            "posts": Post.objects.filter(created_at__date__range=(start, end)).count(),
            "comments": Comment.objects.filter(
                created_at__date__range=(start, end)
            ).count(),
            "likes": Like.objects.filter(created_at__date__range=(start, end)).count(),
            "follows": Follow.objects.filter(
                created_at__date__range=(start, end)
            ).count(),
            "private_chats": Conversation.objects.filter(
                created_at__date__range=(start, end)
            ).count(),
            "study_rooms": Room.objects.filter(
                created_at__date__range=(start, end)
            ).count(),
            "video_minutes": round(video_seconds / 60, 1),
            "badges_awarded": UserBadge.objects.filter(
                awarded_at__date__range=(start, end)
            ).count(),
            "reports": reports_in_range.count() + message_reports_in_range.count(),
            "moderation_actions": moderation_actions,
        },
    }
    return metrics


def get_metrics(start, end):
    key = _cache_key(start, end)
    cached = cache.get(key)
    if cached is not None:
        return cached
    metrics = collect_metrics(start, end)
    cache.set(key, metrics, CACHE_SECONDS)
    return metrics


def analytics_dashboard(request):
    if not can_view_analytics(request.user):
        raise PermissionDenied("You need the analytics permission to view this page.")
    start, end = _parse_range(request)
    metrics = get_metrics(start, end)
    context = {
        **admin.site.each_context(request),
        "title": "Analytics",
        "metrics": metrics,
        "start": start,
        "end": end,
        "export_query": f"?start={start.isoformat()}&end={end.isoformat()}",
        "can_view": True,
    }
    return render(request, "admin/analytics.html", context)


def analytics_export(request):
    if not can_view_analytics(request.user):
        raise PermissionDenied("You need the analytics permission to export this data.")
    start, end = _parse_range(request)
    metrics = get_metrics(start, end)
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = (
        f'attachment; filename="curiousbright-analytics-{start}-to-{end}.csv"'
    )
    writer = csv.writer(response)

    def write_row(row):
        # Prevent spreadsheet formula injection from user-controlled names.
        writer.writerow(
            [
                (
                    f"'{value}"
                    if isinstance(value, str)
                    and value[:1] in ("=", "+", "-", "@", "\t", "\r")
                    else value
                )
                for value in row
            ]
        )

    write_row(["Section", "Metric", "Value"])
    write_row(["Range", "Start", start.isoformat()])
    write_row(["Range", "End", end.isoformat()])

    for key, label in Organization.VerificationStatus.choices:
        value = next(
            (row["value"] for row in metrics["organizations"]["by_status"] if row["key"] == key),
            0,
        )
        write_row(["Organizations", f"Status: {label}", value])
    for key, label in Organization.OrgType.choices:
        value = next(
            (row["value"] for row in metrics["organizations"]["by_type"] if row["key"] == key),
            0,
        )
        write_row(["Organizations", f"Type: {label}", value])
    write_row(["Organizations", "Total", metrics["organizations"]["total"]])
    write_row(
        [
            "Organizations",
            "Average time to verify (hours)",
            round((metrics["organizations"]["average_verification_seconds"] or 0) / 3600, 2),
        ]
    )
    for key, value in metrics["organizations"]["funnel"].items():
        write_row(["Verification funnel", key, value])
    write_row(
        ["Organizations", "Active subscriptions", metrics["organizations"]["active_subscriptions"]]
    )
    write_row(
        ["Organizations", "Expiring in 30 days", metrics["organizations"]["expiring_count"]]
    )
    write_row(["Organizations", "Members", metrics["organizations"]["members_total"]])
    write_row(["Organizations", "Students", metrics["organizations"]["students_total"]])

    for row in metrics["organizations"]["by_country"]:
        write_row(["Organizations by country", row["country"], row["total"]])
    for row in metrics["organizations"]["top"]:
        write_row(
            [
                "Top organizations",
                row["name"],
                f"score={row['score']}; posts={row['posts']}; rooms={row['rooms']}; "
                f"members={row['members']}; students={row['students']}",
            ]
        )
    for row in metrics["organizations"]["expiring_subscriptions"]:
        write_row(
            [
                "Expiring subscriptions",
                row["organization"],
                f"{row['plan']} until {row['period_end'].isoformat()}",
            ]
        )

    for key, value in metrics["platform"].items():
        if key in {"new_users", "active_users"}:
            continue
        write_row(["Platform", key, value])
    for label, value in zip(
        metrics["platform"]["new_users"]["labels"],
        metrics["platform"]["new_users"]["values"],
    ):
        write_row(["New users by day", label, value])
    for label, value in zip(
        metrics["platform"]["active_users"]["labels"],
        metrics["platform"]["active_users"]["values"],
    ):
        write_row(["Active users by day", label, value])
    return response
