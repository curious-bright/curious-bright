from django.urls import path

from . import views

urlpatterns = [
    path(
        "push/web-subscriptions/",
        views.WebSubscriptionView.as_view(),
        name="push_web_subscriptions",
    ),
    path(
        "push/expo-tokens/",
        views.ExpoTokenView.as_view(),
        name="push_expo_tokens",
    ),
    path(
        "push/vapid-public-key/",
        views.VapidPublicKeyView.as_view(),
        name="push_vapid_public_key",
    ),
]
