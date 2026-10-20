from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.community.urls")),
    path("api/", include("apps.gamification.urls")),
    path("api/", include("apps.research.urls")),
]
