from django.urls import path

from . import views

urlpatterns = [
    path("posts/<int:pk>/flag/", views.FlagPostView.as_view(), name="post_flag"),
    path("moderation/queue/", views.ModerationQueueView.as_view(), name="moderation_queue"),
    path("moderation/queue/<int:pk>/approve/", views.ApprovePostView.as_view(), name="moderation_approve"),
    path("moderation/queue/<int:pk>/reject/", views.RejectPostView.as_view(), name="moderation_reject"),
    path("moderation/reports/", views.ReportsListView.as_view(), name="moderation_reports"),
    path("moderation/reports/<int:pk>/resolve/", views.ResolveReportView.as_view(), name="moderation_resolve"),
    path("moderator-applications/me/", views.MyApplicationView.as_view(), name="my_moderator_application"),
    path("moderator-applications/", views.ApplicationListCreateView.as_view(), name="moderator_applications"),
    path(
        "moderator-applications/<int:pk>/<str:decision>/",
        views.ApplicationDecisionView.as_view(),
        name="moderator_application_decision",
    ),
]
