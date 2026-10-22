from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Follow
from apps.community.models import Comment, Post
from apps.core.models import ContentAuditLog
from apps.rooms.models import Room, RoomMember

User = get_user_model()


class VisibilityTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", email="author@example.com", password="Str0ng!Passw0rd99"
        )
        self.follower = User.objects.create_user(
            username="follower", email="follower@example.com", password="Str0ng!Passw0rd99"
        )
        self.stranger = User.objects.create_user(
            username="stranger", email="stranger@example.com", password="Str0ng!Passw0rd99"
        )
        Follow.objects.create(follower=self.follower, followed=self.author)
        self.room = Room.objects.create(name="Quiet room", created_by=self.author)
        RoomMember.objects.create(room=self.room, user=self.follower)

        self.public_post = Post.objects.create(
            author=self.author, title="Public note", body="Everyone can read this."
        )
        self.followers_post = Post.objects.create(
            author=self.author,
            title="Followers note",
            body="Only my followers can read this.",
            visibility=Post.Visibility.FOLLOWERS,
        )
        self.room_post = Post.objects.create(
            author=self.author,
            title="Room note",
            body="Only the study room can read this.",
            visibility=Post.Visibility.ROOM_ONLY,
            room=self.room,
        )
        self.pending_post = Post.objects.create(
            author=self.author,
            title="Pending paper",
            body="Waiting for review.",
            review_status=Post.ReviewStatus.PENDING,
        )
        self.client = APIClient()

    def test_discover_feed_only_returns_published_public_posts(self):
        response = self.client.get("/api/feed/discover/")
        self.assertEqual(response.status_code, 200)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertIn(self.public_post.pk, ids)
        self.assertNotIn(self.followers_post.pk, ids)
        self.assertNotIn(self.room_post.pk, ids)
        self.assertNotIn(self.pending_post.pk, ids)

    def test_followers_visibility_is_enforced_at_object_level(self):
        self.client.force_authenticate(user=self.follower)
        self.assertEqual(self.client.get(f"/api/posts/{self.followers_post.pk}/").status_code, 200)

        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(self.client.get(f"/api/posts/{self.followers_post.pk}/").status_code, 404)

        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(f"/api/posts/{self.followers_post.pk}/").status_code, 404)

    def test_following_feed_contains_own_and_followed_posts_only(self):
        self.client.force_authenticate(user=self.follower)
        ids = [row["id"] for row in self.client.get("/api/feed/following/").json()["results"]]
        self.assertIn(self.public_post.pk, ids)
        self.assertIn(self.followers_post.pk, ids)
        # The follower is also a member of the room in this fixture.
        self.assertIn(self.room_post.pk, ids)

        self.client.force_authenticate(user=self.stranger)
        ids = [row["id"] for row in self.client.get("/api/feed/following/").json()["results"]]
        self.assertNotIn(self.followers_post.pk, ids)

    def test_room_visibility_requires_room_membership(self):
        self.client.force_authenticate(user=self.follower)
        self.assertEqual(self.client.get(f"/api/posts/{self.room_post.pk}/").status_code, 200)

        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(self.client.get(f"/api/posts/{self.room_post.pk}/").status_code, 404)

    def test_author_can_see_own_unpublished_post(self):
        self.client.force_authenticate(user=self.author)
        response = self.client.get(f"/api/posts/{self.pending_post.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["review_status"], "pending")

    def test_public_serializers_never_expose_email(self):
        response = self.client.get("/api/feed/discover/")
        self.assertNotIn("author@example.com", response.content.decode())
        self.assertNotIn("follower@example.com", response.content.decode())

        self.client.force_authenticate(user=self.follower)
        comment = Comment.objects.create(
            post=self.public_post, author=self.follower, body="A public comment"
        )
        self.assertTrue(comment.pk)
        detail = self.client.get(f"/api/posts/{self.public_post.pk}/")
        self.assertNotIn("follower@example.com", detail.content.decode())

    def test_follower_lists_never_expose_email(self):
        response = self.client.get(f"/api/auth/profiles/{self.author.username}/followers/")
        self.assertEqual(response.status_code, 200)
        rows = response.json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertEqual([row["username"] for row in rows], [self.follower.username])
        self.assertNotIn("email", rows[0])

        response = self.client.get(f"/api/auth/profiles/{self.follower.username}/following/")
        rows = response.json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertEqual([row["username"] for row in rows], [self.author.username])
        self.assertNotIn("email", rows[0])


class PostEditingTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", email="author@example.com", password="Str0ng!Passw0rd99"
        )
        self.other = User.objects.create_user(
            username="other", email="other@example.com", password="Str0ng!Passw0rd99"
        )
        self.post = Post.objects.create(author=self.author, title="Original", body="Body one.")
        self.client = APIClient()

    def test_edit_sets_edited_flag_and_writes_audit(self):
        self.client.force_authenticate(user=self.author)
        response = self.client.patch(
            f"/api/posts/{self.post.pk}/",
            {"title": "Revised", "visibility": Post.Visibility.FOLLOWERS},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.post.refresh_from_db()
        self.assertEqual(self.post.title, "Revised")
        self.assertTrue(self.post.is_edited)
        self.assertIsNotNone(self.post.edited_at)
        audit = ContentAuditLog.objects.get(
            action=ContentAuditLog.Action.EDIT,
            content_type="community.post",
            object_id=str(self.post.pk),
        )
        self.assertEqual(audit.actor, self.author)
        self.assertEqual(audit.metadata["changes"]["title"], ["Original", "Revised"])

    def test_stale_edit_is_rejected_without_writing(self):
        old_timestamp = (timezone.now() - timedelta(minutes=5)).isoformat()
        self.client.force_authenticate(user=self.author)
        response = self.client.patch(
            f"/api/posts/{self.post.pk}/",
            {"title": "Should not land", "expected_updated_at": old_timestamp},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "conflict")
        self.post.refresh_from_db()
        self.assertEqual(self.post.title, "Original")

    def test_non_author_cannot_edit(self):
        self.client.force_authenticate(user=self.other)
        response = self.client.patch(
            f"/api/posts/{self.post.pk}/", {"title": "Hijacked"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.post.refresh_from_db()
        self.assertEqual(self.post.title, "Original")

    def test_delete_cascades_comments_and_undo_restores_them(self):
        comment = Comment.objects.create(post=self.post, author=self.other, body="Reply")
        self.client.force_authenticate(user=self.author)
        self.assertEqual(self.client.delete(f"/api/posts/{self.post.pk}/").status_code, 204)
        comment.refresh_from_db()
        self.assertTrue(comment.is_deleted)

        self.assertEqual(self.client.post(f"/api/posts/{self.post.pk}/restore/").status_code, 200)
        comment.refresh_from_db()
        self.assertFalse(comment.is_deleted)
        self.assertEqual(self.client.get(f"/api/posts/{self.post.pk}/").status_code, 200)

    def test_activity_history_is_private_to_owner_and_moderators(self):
        self.client.force_authenticate(user=self.other)
        self.assertEqual(
            self.client.get(f"/api/posts/{self.post.pk}/activity/").status_code, 403
        )
        self.client.force_authenticate(user=self.author)
        response = self.client.get(f"/api/posts/{self.post.pk}/activity/")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)

    def test_comment_edit_cannot_move_comment_to_another_post(self):
        target = Post.objects.create(author=self.author, title="Target", body="Other")
        comment = Comment.objects.create(post=self.post, author=self.other, body="Mine")
        self.client.force_authenticate(user=self.other)
        response = self.client.patch(
            f"/api/comments/{comment.pk}/",
            {"body": "Edited", "post": target.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        comment.refresh_from_db()
        self.assertEqual(comment.body, "Edited")
        self.assertEqual(comment.post_id, self.post.pk)
        self.assertTrue(comment.is_edited)
