from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.community.models import Comment, Post
from apps.research.models import ResearchDocument
from apps.rooms.models import Room


class Command(BaseCommand):
    help = "Hard-delete soft-deleted posts, comments, rooms and research past the retention window."

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
        rooms = Room.all_objects.filter(is_deleted=True, deleted_at__lt=cutoff)
        research = ResearchDocument.all_objects.filter(
            is_deleted=True, deleted_at__lt=cutoff
        )

        if options["dry_run"]:
            self.stdout.write(
                f"Would purge {posts.count()} posts, {comments.count()} comments, "
                f"{rooms.count()} rooms and {research.count()} research documents."
            )
            return

        counts = {
            "posts": posts.count(),
            "comments": comments.count(),
            "rooms": rooms.count(),
            "research": research.count(),
        }
        posts.hard_delete()
        comments.hard_delete()
        rooms.hard_delete()
        research.hard_delete()
        self.stdout.write(
            self.style.SUCCESS(
                "Purged {posts} posts, {comments} comments, {rooms} rooms and "
                "{research} research documents.".format(**counts)
            )
        )
