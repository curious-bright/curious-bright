from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import Count, Q
from django.http import JsonResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.community.models import Post
from apps.community.serializers import PostListSerializer
from apps.community.visibility import visible_posts
from apps.core.legal import current_versions
from apps.rooms.models import Room
from apps.rooms.serializers import RoomSerializer

User = get_user_model()


def health(request):
    """Liveness/readiness probe used by the hosting platform."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    status = 200 if db_ok else 503
    return JsonResponse({"status": "ok" if db_ok else "degraded", "database": db_ok}, status=status)



class LegalVersionsView(APIView):
    """Public policy versions so clients can show the current documents."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(current_versions())


def _search_user_row(user, request):
    """Flat person row for search results.

    Keeps the web page's ``headline`` and adds the fields the mobile member
    rows render, without paying for the full profile serializer per hit.
    """
    profile = getattr(user, "profile", None)
    bio = (profile.bio or "") if profile else ""
    expertise = (profile.subject_expertise or "") if profile else ""
    avatar = (profile.avatar or "") if profile else ""
    if profile and profile.avatar_file:
        try:
            avatar = request.build_absolute_uri(profile.avatar_file.url)
        except (ValueError, NotImplementedError):
            pass
    return {
        "id": user.id,
        "username": user.username,
        "headline": (expertise or bio)[:120],
        "avatar_url": avatar,
        "bio": bio,
        "subject_expertise": expertise,
    }


class SearchView(APIView):
    """Cross-domain keyword search: posts, study rooms and people.

    Returns plain (non-paginated) lists capped at 10 each — enough for a
    results page without three round-trips.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response({"posts": [], "rooms": [], "users": []})

        posts = (
            visible_posts(request.user)
            .filter(Q(title__icontains=q) | Q(body__icontains=q))
            .select_related("author", "author__profile")
            .prefetch_related("equations")
            .order_by("-created_at")[:10]
        )
        rooms = Room.objects.filter(Q(name__icontains=q) | Q(topic__icontains=q)).annotate(
            member_count=Count("memberships")
        )[:10]
        users = (
            User.objects.filter(
                Q(username__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(profile__bio__icontains=q)
                | Q(profile__subject_expertise__icontains=q)
            )
            .select_related("profile")
            .distinct()[:10]
        )

        return Response(
            {
                "posts": PostListSerializer(posts, many=True, context={"request": request}).data,
                "rooms": RoomSerializer(rooms, many=True, context={"request": request}).data,
                "users": [_search_user_row(u, request) for u in users],
            }
        )
