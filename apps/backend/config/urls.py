from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from apps.core.admin_analytics import analytics_dashboard, analytics_export
from apps.core.views import LegalVersionsView, SearchView, health

urlpatterns = [
    path("", health, name="health"),
    path("healthz/", health, name="healthz"),
    path("api/legal/versions/", LegalVersionsView.as_view(), name="legal_versions"),
    path(
        "admin/analytics/",
        admin.site.admin_view(analytics_dashboard),
        name="admin_analytics",
    ),
    path(
        "admin/analytics/export/",
        admin.site.admin_view(analytics_export),
        name="admin_analytics_export",
    ),
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.community.urls")),
    path("api/", include("apps.gamification.urls")),
    path("api/", include("apps.research.urls")),
    path("api/", include("apps.moderation.urls")),
    path("api/", include("apps.rooms.urls")),
    path("api/", include("apps.organizations.urls")),
    path("api/", include("apps.billing.urls")),
    path("api/", include("apps.messaging.urls")),
    path("api/search/", SearchView.as_view(), name="search"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # Stopgap until media moves to object storage: serve uploads from the
    # container filesystem so PDFs work with DJANGO_DEBUG=false.
    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    ]
