from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views
from .google_oauth import GoogleOAuthView

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("google/", GoogleOAuthView.as_view(), name="google_oauth"),
    path("verify-email/", views.VerifyEmailView.as_view(), name="verify_email"),
    path("resend-code/", views.ResendVerificationCodeView.as_view(), name="resend_code"),
    path("change-email/", views.ChangeEmailView.as_view(), name="change_email"),
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="password_reset"),
    path(
        "password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password_reset_confirm",
    ),
    # SimpleJWT login + refresh (throttled via scoped rate in override views)
    path("token/", views.RateLimitedTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", views.RateLimitedTokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("ws-ticket/", views.WebSocketTicketView.as_view(), name="ws_ticket"),
    path("me/", views.MeView.as_view(), name="me"),
    path("consent/", views.ConsentView.as_view(), name="consent"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change_password"),
    path("export/", views.ExportAccountView.as_view(), name="account_export"),
    path("delete-account/", views.DeleteAccountView.as_view(), name="account_delete"),
    path("profiles/<str:username>/", views.ProfileDetailView.as_view(), name="profile_detail"),
    path("profiles/<str:username>/follow/", views.FollowView.as_view(), name="follow"),
    path("profiles/<str:username>/is-following/", views.IsFollowingView.as_view(), name="is_following"),
    path("profiles/<str:username>/followers/", views.FollowersListView.as_view(), name="followers"),
    path("profiles/<str:username>/following/", views.FollowingListView.as_view(), name="following"),
]
