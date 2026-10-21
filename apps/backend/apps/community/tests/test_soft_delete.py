from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.community.models import Comment, Post

User = get_user_model()


class SoftDeleteTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", email="author@example.com", password="Str0ng!Passw0rd99"
        )
        self.other = User.objects.create_user(
            username="other", email="other@example.com", password="Str0ng!Passw0rd99"
        )
        self.post = Post.objects.create(author=self.author, title="Limits", body="Explain limits.")
        self.client = APIClient()

    def test_delete_hides_post_and_restore_undoes_it(self):
        self.client.force_authenticate(user=self.author)
        response = self.client.delete(f"/api/posts/{self.post.pk}/")
        self.assertEqual(response.status_code, 204)

        self.assertFalse(Post.objects.filter(pk=self.post.pk).exists())
        self.assertTrue(Post.all_objects.get(pk=self.post.pk).is_deleted)
        self.assertEqual(self.client.get(f"/api/posts/{self.post.pk}/").status_code, 404)
        self.assertEqual(self.client.get("/api/posts/").json()["results"], [])

        restored = self.client.post(f"/api/posts/{self.post.pk}/restore/")
        self.assertEqual(restored.status_code, 200)
        self.assertFalse(Post.all_objects.get(pk=self.post.pk).is_deleted)
        self.assertEqual(self.client.get(f"/api/posts/{self.post.pk}/").status_code, 200)

    def test_non_author_cannot_delete(self):
        self.client.force_authenticate(user=self.other)
        response = self.client.delete(f"/api/posts/{self.post.pk}/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Post.objects.filter(pk=self.post.pk).exists())

    def test_deleted_parent_comment_stays_as_tombstone(self):
        commenter = User.objects.create_user(
            username="commenter", email="c@example.com", password="Str0ng!Passw0rd99"
        )
        replier = User.objects.create_user(
            username="replier", email="r@example.com", password="Str0ng!Passw0rd99"
        )
        parent = Comment.objects.create(post=self.post, author=commenter, body="First thought")
        Comment.objects.create(post=self.post, author=replier, parent=parent, body="A reply")
        Post.objects.filter(pk=self.post.pk).update(comment_count=2)

        self.client.force_authenticate(user=commenter)
        self.assertEqual(self.client.delete(f"/api/comments/{parent.pk}/").status_code, 204)

        detail = self.client.get(f"/api/posts/{self.post.pk}/").json()
        self.assertEqual(len(detail["comments"]), 1)
        self.assertTrue(detail["comments"][0]["is_deleted"])
        self.assertEqual(detail["comments"][0]["body"], "")
        self.assertEqual(len(detail["comments"][0]["replies"]), 1)
        self.assertEqual(detail["comment_count"], 1)

    def test_restore_window_expires(self):
        self.post.delete(deleted_by=self.author)
        Post.all_objects.filter(pk=self.post.pk).update(
            deleted_at=timezone.now() - timedelta(hours=1)
        )
        self.client.force_authenticate(user=self.author)
        response = self.client.post(f"/api/posts/{self.post.pk}/restore/")
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["code"], "restore_window_expired")
        self.assertEqual(set(response.json()), {"code", "message"})

    def test_purge_command_removes_expired_rows(self):
        self.post.delete(deleted_by=self.author)
        Post.all_objects.filter(pk=self.post.pk).update(
            deleted_at=timezone.now() - timedelta(days=31)
        )
        call_command("purge_deleted", verbosity=0)
        self.assertFalse(Post.all_objects.filter(pk=self.post.pk).exists())
