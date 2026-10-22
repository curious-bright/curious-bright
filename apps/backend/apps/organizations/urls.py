from django.urls import path

from . import views

urlpatterns = [
    path("organizations/", views.OrganizationListCreateView.as_view(), name="org_list_create"),
    path(
        "organizations/students/template/",
        views.StudentCSVTemplateView.as_view(),
        name="org_students_template",
    ),
    path("organizations/join-by-domain/", views.JoinByDomainView.as_view(), name="org_join_domain"),
    path("organizations/invitations/me/", views.MyInvitationsView.as_view(), name="org_my_invitations"),
    path(
        "organizations/invitations/<uuid:token>/accept/",
        views.AcceptInvitationView.as_view(),
        name="org_accept_invitation",
    ),
    path("organizations/<slug:slug>/", views.OrganizationDetailView.as_view(), name="org_detail"),
    path("organizations/<slug:slug>/members/", views.MemberListView.as_view(), name="org_members"),
    path(
        "organizations/<slug:slug>/members/invite/",
        views.InviteMembersView.as_view(),
        name="org_members_invite",
    ),
    # Compatibility with the institutional portal's /users endpoint.
    path("organizations/<slug:slug>/users/", views.InviteMembersView.as_view(), name="org_users"),
    path(
        "organizations/<slug:slug>/members/<int:pk>/",
        views.MemberDetailView.as_view(),
        name="org_member_detail",
    ),
    path(
        "organizations/<slug:slug>/invitations/",
        views.InvitationListView.as_view(),
        name="org_invitations",
    ),
    path(
        "organizations/<slug:slug>/invitations/<int:pk>/",
        views.RevokeInvitationView.as_view(),
        name="org_invitation_revoke",
    ),
    path("organizations/<slug:slug>/stats/", views.OrganizationStatsView.as_view(), name="org_stats"),
    path(
        "organizations/<slug:slug>/members.csv",
        views.OrganizationCSVExportView.as_view(),
        name="org_members_csv",
    ),
    path(
        "organizations/<slug:slug>/students/",
        views.CreateStudentAccountView.as_view(),
        name="org_student_create",
    ),
    path(
        "organizations/<slug:slug>/students/import/",
        views.BulkStudentImportView.as_view(),
        name="org_students_import",
    ),
    path(
        "organizations/<slug:slug>/members/link/",
        views.LinkMemberAccountView.as_view(),
        name="org_member_link",
    ),
    path(
        "organizations/<slug:slug>/audit-logs/",
        views.OrganizationAuditLogView.as_view(),
        name="org_audit_logs",
    ),
]
