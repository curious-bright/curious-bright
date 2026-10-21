from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.organizations.models import (
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
)

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class OrganizationAPITests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@greenfield.edu", password="Str0ng!Passw0rd99"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.org = Organization.objects.create(name="Greenfield University", owner=self.owner)
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role=OrganizationMembership.Role.OWNER,
        )

    def make_member(self, username, role, email=None):
        user = User.objects.create_user(
            username=username,
            email=email or f"{username}@greenfield.edu",
            password="Str0ng!Passw0rd99",
        )
        OrganizationMembership.objects.create(
            organization=self.org, user=user, role=role
        )
        return user

    def test_create_organization_makes_owner_membership(self):
        response = self.client.post(
            "/api/organizations/",
            {"name": "Bright Academy", "domain": "bright.edu"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["slug"], "bright-academy")
        self.assertEqual(body["my_role"], "owner")
        org = Organization.objects.get(slug="bright-academy")
        self.assertTrue(
            org.memberships.filter(
                user=self.owner, role=OrganizationMembership.Role.OWNER
            ).exists()
        )
        self.assertTrue(org.audit_logs.filter(action="organization.created").exists())

    def test_list_only_shows_my_organizations(self):
        outsider = User.objects.create_user(
            username="outsider", email="outsider@elsewhere.com", password="Str0ng!Passw0rd99"
        )
        self.client.force_authenticate(user=outsider)
        self.assertEqual(self.client.get("/api/organizations/").json(), [])
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(len(self.client.get("/api/organizations/").json()), 1)

    def test_non_member_gets_404(self):
        outsider = User.objects.create_user(
            username="outsider", email="outsider@elsewhere.com", password="Str0ng!Passw0rd99"
        )
        self.client.force_authenticate(user=outsider)
        self.assertEqual(self.client.get(f"/api/organizations/{self.org.slug}/").status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/organizations/{self.org.slug}/members/").status_code, 404
        )

    def test_only_admins_can_invite(self):
        student = self.make_member("student", OrganizationMembership.Role.STUDENT)
        self.client.force_authenticate(user=student)
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/members/invite/",
            {"emails": ["new@greenfield.edu"]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_invite_and_email_is_sent(self):
        admin = self.make_member("admin", OrganizationMembership.Role.ADMIN)
        self.client.force_authenticate(user=admin)
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/members/invite/",
            {"emails": ["new@greenfield.edu"], "role": "teacher"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["results"][0]["success"])
        invitation = OrganizationInvitation.objects.get(email="new@greenfield.edu")
        self.assertEqual(invitation.role, OrganizationMembership.Role.TEACHER)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(str(invitation.token), mail.outbox[0].body)

    def test_admin_cannot_invite_another_admin(self):
        admin = self.make_member("admin", OrganizationMembership.Role.ADMIN)
        self.client.force_authenticate(user=admin)
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/members/invite/",
            {"emails": ["other@greenfield.edu"], "role": "admin"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_accept_invitation_creates_membership(self):
        invitee = User.objects.create_user(
            username="invitee", email="invitee@greenfield.edu", password="Str0ng!Passw0rd99"
        )
        invitation = OrganizationInvitation.objects.create(
            organization=self.org,
            email=invitee.email,
            role=OrganizationMembership.Role.TEACHER,
            invited_by=self.owner,
            expires_at=self._future(),
        )
        self.client.force_authenticate(user=invitee)
        response = self.client.post(f"/api/organizations/invitations/{invitation.token}/accept/")
        self.assertEqual(response.status_code, 200)
        membership = OrganizationMembership.objects.get(organization=self.org, user=invitee)
        self.assertEqual(membership.role, OrganizationMembership.Role.TEACHER)
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.accepted_at)

    def test_accept_requires_matching_email(self):
        invitee = User.objects.create_user(
            username="invitee", email="someone@else.com", password="Str0ng!Passw0rd99"
        )
        invitation = OrganizationInvitation.objects.create(
            organization=self.org,
            email="invitee@greenfield.edu",
            invited_by=self.owner,
            expires_at=self._future(),
        )
        self.client.force_authenticate(user=invitee)
        response = self.client.post(f"/api/organizations/invitations/{invitation.token}/accept/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "email_mismatch")
        self.assertFalse(OrganizationMembership.objects.filter(user=invitee).exists())

    def test_expired_invitation_cannot_be_accepted(self):
        from datetime import timedelta

        from django.utils import timezone

        invitee = User.objects.create_user(
            username="invitee", email="invitee@greenfield.edu", password="Str0ng!Passw0rd99"
        )
        invitation = OrganizationInvitation.objects.create(
            organization=self.org,
            email=invitee.email,
            invited_by=self.owner,
            expires_at=timezone.now() - timedelta(days=1),
        )
        self.client.force_authenticate(user=invitee)
        response = self.client.post(f"/api/organizations/invitations/{invitation.token}/accept/")
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["code"], "invitation_expired")

    def test_seat_limit_blocks_invites(self):
        self.org.seat_limit = 2
        self.org.save()
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/members/invite/",
            {"emails": ["one@greenfield.edu", "two@greenfield.edu"]},
            format="json",
        )
        results = response.json()["results"]
        self.assertTrue(results[0]["success"])
        self.assertFalse(results[1]["success"])
        self.assertIn("Seat limit", results[1]["error"])

    def test_signup_auto_accepts_pending_invitation(self):
        OrganizationInvitation.objects.create(
            organization=self.org,
            email="fresh@greenfield.edu",
            role=OrganizationMembership.Role.STUDENT,
            invited_by=self.owner,
            expires_at=self._future(),
        )
        fresh = User.objects.create_user(
            username="fresh", email="fresh@greenfield.edu", password="Str0ng!Passw0rd99"
        )
        self.assertTrue(
            OrganizationMembership.objects.filter(organization=self.org, user=fresh).exists()
        )
        self.assertEqual(
            OrganizationInvitation.objects.get(email="fresh@greenfield.edu").accepted_by, fresh
        )

    def test_domain_join(self):
        user = User.objects.create_user(
            username="domainuser", email="domainuser@greenfield.edu", password="Str0ng!Passw0rd99"
        )
        self.org.domain = "greenfield.edu"
        self.org.auto_join_domain = True
        self.org.save()
        self.client.force_authenticate(user=user)
        response = self.client.post("/api/organizations/join-by-domain/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["slug"], self.org.slug)
        self.assertTrue(
            OrganizationMembership.objects.filter(organization=self.org, user=user).exists()
        )

    def test_domain_join_requires_auto_join(self):
        user = User.objects.create_user(
            username="domainuser", email="domainuser@greenfield.edu", password="Str0ng!Passw0rd99"
        )
        self.org.domain = "greenfield.edu"
        self.org.save()
        self.client.force_authenticate(user=user)
        response = self.client.post("/api/organizations/join-by-domain/")
        self.assertEqual(response.status_code, 404)

    def test_owner_cannot_be_removed(self):
        membership = self.org.memberships.get(user=self.owner)
        response = self.client.delete(
            f"/api/organizations/{self.org.slug}/members/{membership.pk}/"
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_remove_lower_member(self):
        admin = self.make_member("admin", OrganizationMembership.Role.ADMIN)
        student = self.make_member("student", OrganizationMembership.Role.STUDENT)
        self.client.force_authenticate(user=admin)
        membership = self.org.memberships.get(user=student)
        response = self.client.delete(
            f"/api/organizations/{self.org.slug}/members/{membership.pk}/"
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(self.org.memberships.filter(user=student).exists())

    def test_member_can_leave_without_admin_rights(self):
        student = self.make_member("student", OrganizationMembership.Role.STUDENT)
        self.client.force_authenticate(user=student)
        membership = self.org.memberships.get(user=student)
        response = self.client.delete(
            f"/api/organizations/{self.org.slug}/members/{membership.pk}/"
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get("/api/organizations/").json(), [])

    def test_member_list_hides_emails_from_regular_members(self):
        student = self.make_member("student", OrganizationMembership.Role.STUDENT)
        admin = self.make_member("admin", OrganizationMembership.Role.ADMIN)
        self.client.force_authenticate(user=student)
        body = self.client.get(f"/api/organizations/{self.org.slug}/members/").json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertTrue(all(row["email"] == "" for row in rows))
        self.client.force_authenticate(user=admin)
        body = self.client.get(f"/api/organizations/{self.org.slug}/members/").json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertTrue(any(row["email"] for row in rows))

    def test_audit_log_is_admin_only(self):
        student = self.make_member("student", OrganizationMembership.Role.STUDENT)
        self.client.force_authenticate(user=student)
        self.assertEqual(
            self.client.get(f"/api/organizations/{self.org.slug}/audit-logs/").status_code, 403
        )
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/organizations/{self.org.slug}/audit-logs/")
        self.assertEqual(response.status_code, 200)

    def test_stats_endpoint(self):
        self.make_member("student", OrganizationMembership.Role.STUDENT)
        response = self.client.get(f"/api/organizations/{self.org.slug}/stats/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["roles"]["student"], 1)
        self.assertEqual(response.json()["seats_used"], 2)

    def test_member_cannot_escalate_role(self):
        moderator = self.make_member("moderator", OrganizationMembership.Role.MODERATOR)
        target = self.make_member("student", OrganizationMembership.Role.STUDENT)
        self.client.force_authenticate(user=moderator)
        membership = self.org.memberships.get(user=target)
        response = self.client.patch(
            f"/api/organizations/{self.org.slug}/members/{membership.pk}/",
            {"role": "admin"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_promote_lower_member(self):
        admin = self.make_member("admin", OrganizationMembership.Role.ADMIN)
        target = self.make_member("student", OrganizationMembership.Role.STUDENT)
        self.client.force_authenticate(user=admin)
        membership = self.org.memberships.get(user=target)
        response = self.client.patch(
            f"/api/organizations/{self.org.slug}/members/{membership.pk}/",
            {"role": "teacher", "title": "Science"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        membership.refresh_from_db()
        self.assertEqual(membership.role, OrganizationMembership.Role.TEACHER)
        self.assertEqual(membership.title, "Science")

    def test_owner_can_deactivate_organization(self):
        self.assertEqual(
            self.client.delete(f"/api/organizations/{self.org.slug}/").status_code, 204
        )
        self.org.refresh_from_db()
        self.assertFalse(self.org.is_active)

    def test_admin_cannot_deactivate_organization(self):
        admin = self.make_member("admin", OrganizationMembership.Role.ADMIN)
        self.client.force_authenticate(user=admin)
        self.assertEqual(
            self.client.delete(f"/api/organizations/{self.org.slug}/").status_code, 403
        )

    @staticmethod
    def _future():
        from datetime import timedelta

        from django.utils import timezone

        return timezone.now() + timedelta(days=7)
