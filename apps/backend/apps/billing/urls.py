from django.urls import path

from . import views

urlpatterns = [
    path("billing/plans/", views.PlansView.as_view(), name="billing_plans"),
    path("billing/checkout/", views.CheckoutView.as_view(), name="billing_checkout"),
    path(
        "billing/payments/<str:reference>/",
        views.PaymentDetailView.as_view(),
        name="billing_payment_detail",
    ),
    path(
        "billing/payments/<str:reference>/verify/",
        views.VerifyPaymentView.as_view(),
        name="billing_payment_verify",
    ),
    path(
        "billing/webhook/paystack/",
        views.PaystackWebhookView.as_view(),
        name="billing_paystack_webhook",
    ),
    path(
        "organizations/<slug:slug>/subscription/",
        views.OrganizationSubscriptionView.as_view(),
        name="org_subscription",
    ),
    path(
        "organizations/<slug:slug>/subscribe/",
        views.OrganizationSubscribeView.as_view(),
        name="org_subscribe",
    ),
]
