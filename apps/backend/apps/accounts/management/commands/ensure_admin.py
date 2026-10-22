"""Idempotent admin bootstrap — no shell, no createsuperuser needed.

Reads ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD from the environment only.
If the admin already exists it does nothing (never resets an existing password).
Profile creation is handled automatically by the post_save signal.
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create the initial staff/superuser from environment variables (idempotent)."

    def handle(self, *args, **options):
        User = get_user_model()
        username = os.environ.get("ADMIN_USERNAME")
        email = os.environ.get("ADMIN_EMAIL")
        password = os.environ.get("ADMIN_PASSWORD")

        missing = [
            name
            for name, value in (
                ("ADMIN_USERNAME", username),
                ("ADMIN_EMAIL", email),
                ("ADMIN_PASSWORD", password),
            )
            if not value
        ]
        if missing:
            raise CommandError(
                "Missing required environment variable(s): "
                + ", ".join(missing)
                + ". Set them in your deploy platform and redeploy."
            )

        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.WARNING(f"Admin '{username}' already exists — nothing to do."))
            return

        user = User.objects.create_superuser(username=username, email=email, password=password)
        if hasattr(user, "profile"):
            user.profile.must_change_password = True
            user.profile.save(update_fields=["must_change_password"])
        self.stdout.write(self.style.SUCCESS(f"Admin '{user.username}' created (profile auto-created)."))
