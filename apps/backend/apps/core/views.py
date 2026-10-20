from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.community.models import Post
from apps.community.serializers import PostListSerializer
from apps.rooms.models import Room
from apps.rooms.serializers import RoomSerializer

User = get_user_model()


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
            Post.objects.filter(review_status=Post.ReviewStatus.PUBLISHED)
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
                "users": [
                    {
                        "id": u.id,
                        "username": u.username,
                        "headline": (u.profile.subject_expertise or u.profile.bio or "")[:120]
                        if hasattr(u, "profile")
                        else "",
                    }
                    for u in users
                ],
            }
        )
