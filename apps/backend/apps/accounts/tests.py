from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.community.models import Post
from apps.organizations.models import Organization, OrganizationMembership

User = get_user_model()
PASSWORD = "Str0ng!Passw0rd99"


class DeleteAccountTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="leaver", email="leaver@example.com", password=PASSWORD
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def delete(self, password=PASSWORD, confirmation="delete my account"):
        return self.client.post(
            "/api/auth/delete-account/",
            {"password": password, "confirmation": confirmation},
            format="json",
        )

    def test_account_deletes_with_password_confirmation(self):
        response = self.delete()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())

    def test_wrong_password_is_rejected(self):
        response = self.delete(password="not-the-password")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_password")
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_organization_owner_gets_actionable_conflict(self):
        org = Organization.objects.create(name="Greenfield University", owner=self.user)
        OrganizationMembership.objects.create(
            organization=org,
            user=self.user,
            role=OrganizationMembership.Role.OWNER,
        )

        response = self.delete()

        self.assertEqual(response.status_code, 409)
        body = response.json()
        self.assertEqual(set(body), {"code", "message"})
        self.assertEqual(body["code"], "organization_owner")
        self.assertIn("Greenfield University", body["message"])
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())


class ProfilePostCountTests(TestCase):
    """The profile stat strip must match the posts the viewer can see."""

    def setUp(self):
        self.author = User.objects.create_user(
            username="counter", email="counter@example.com", password=PASSWORD
        )
        self.viewer = User.objects.create_user(
            username="reader", email="reader@example.com", password=PASSWORD
        )
        self.public_post = Post.objects.create(
            author=self.author,
            title="Public note",
            body="Visible to everyone.",
            visibility=Post.Visibility.PUBLIC,
            review_status=Post.ReviewStatus.PUBLISHED,
        )
        self.private_post = Post.objects.create(
            author=self.author,
            title="Followers note",
            body="Only followers can read this.",
            visibility=Post.Visibility.FOLLOWERS,
            review_status=Post.ReviewStatus.PUBLISHED,
        )
        self.deleted_post = Post.objects.create(
            author=self.author,
            title="Deleted note",
            body="Should not be counted.",
            visibility=Post.Visibility.PUBLIC,
            review_status=Post.ReviewStatus.PUBLISHED,
        )
        self.deleted_post.delete(deleted_by=self.author)

        self.client = APIClient()

    def profile(self):
        return self.client.get(f"/api/auth/profiles/{self.author.username}/")

    def test_anonymous_visitor_sees_only_public_posts(self):
        response = self.profile()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["post_count"], 1)

    def test_author_sees_own_private_posts(self):
        self.client.force_authenticate(user=self.author)

        response = self.profile()

        self.assertEqual(response.json()["post_count"], 2)

    def test_follower_sees_followers_only_post(self):
        from apps.accounts.models import Follow

        Follow.objects.create(follower=self.viewer, followed=self.author)
        self.client.force_authenticate(user=self.viewer)

        response = self.profile()

        self.assertEqual(response.json()["post_count"], 2)
