from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.core.views import SearchView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.community.urls")),
    path("api/", include("apps.gamification.urls")),
    path("api/", include("apps.research.urls")),
    path("api/", include("apps.moderation.urls")),
    path("api/", include("apps.rooms.urls")),
    path("api/search/", SearchView.as_view(), name="search"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
