from django.urls import path

from . import views

urlpatterns = [
    path("badges/", views.BadgeListView.as_view(), name="badge_list"),
    path("badges/mine/", views.MyBadgesView.as_view(), name="my_badges"),
]
