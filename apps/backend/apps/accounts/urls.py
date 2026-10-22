from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    # SimpleJWT login + refresh (throttled via scoped rate in override views)
    path("token/", views.RateLimitedTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", views.RateLimitedTokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change_password"),
    path("export/", views.ExportAccountView.as_view(), name="account_export"),
    path("delete-account/", views.DeleteAccountView.as_view(), name="account_delete"),
    path("profiles/<str:username>/", views.ProfileDetailView.as_view(), name="profile_detail"),
    path("profiles/<str:username>/follow/", views.FollowView.as_view(), name="follow"),
    path("profiles/<str:username>/is-following/", views.IsFollowingView.as_view(), name="is_following"),
    path("profiles/<str:username>/followers/", views.FollowersListView.as_view(), name="followers"),
    path("profiles/<str:username>/following/", views.FollowingListView.as_view(), name="following"),
]
