from django.urls import path

from . import views

urlpatterns = [
    path("research/", views.ResearchDocumentViewSet.as_view(), name="research_list_create"),
    path("research/<int:pk>/", views.ResearchDocumentDetailView.as_view(), name="research_detail"),
    path("research/<int:pk>/restore/", views.RestoreResearchDocumentView.as_view(), name="research_restore"),
    path("research/<int:pk>/invite/", views.InviteCollaboratorView.as_view(), name="research_invite"),
    path("research/<int:pk>/revisions/", views.DocumentRevisionsView.as_view(), name="research_revisions"),
    path(
        "research/<int:pk>/revisions/<int:revision_id>/restore/",
        views.RestoreRevisionView.as_view(),
        name="research_revision_restore",
    ),
    path("research/invitations/", views.MyInvitationsView.as_view(), name="research_invitations"),
    path("research/invitations/<int:pk>/respond/", views.RespondToInvitationView.as_view(), name="research_respond"),
]
