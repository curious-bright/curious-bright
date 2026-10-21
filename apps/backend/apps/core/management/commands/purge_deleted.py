from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.community.models import Comment, Post


class Command(BaseCommand):
    help = "Hard-delete soft-deleted posts/comments past the retention window."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=getattr(settings, "SOFT_DELETE_RETENTION_DAYS", 30),
            help="Retention window in days (default: settings.SOFT_DELETE_RETENTION_DAYS).",
        )
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=options["days"])
        posts = Post.all_objects.filter(is_deleted=True, deleted_at__lt=cutoff)
        # Only purge leaf comments now; parents become leaves on a later run,
        # which keeps tombstoned threads consistent until every reply is gone.
        comments = Comment.all_objects.filter(
            is_deleted=True, deleted_at__lt=cutoff, replies__isnull=True
        )

        if options["dry_run"]:
            self.stdout.write(
                f"Would purge {posts.count()} posts and {comments.count()} comments."
            )
            return

        post_count = posts.count()
        comment_count = comments.count()
        posts.hard_delete()
        comments.hard_delete()
        self.stdout.write(
            self.style.SUCCESS(f"Purged {post_count} posts and {comment_count} comments.")
        )
