"""Data-migration fallback for admin bootstrap.

Runs during `manage.py migrate` so the admin exists even if the deploy
script forgot to call `ensure_admin`. Unlike the management command, this
migration is lenient: if the env vars are missing it does nothing, so
`migrate` never breaks in CI or on developer machines.
"""
import os

from django.db import migrations


def create_admin(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    username = os.environ.get("ADMIN_USERNAME")
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not (username and email and password):
        return
    if User.objects.filter(username=username).exists():
        return
    user = User.objects.create_superuser(username=username, email=email, password=password)
    # post_save signal creates the Profile in normal operation; in historical
    # models signals do not fire, so mirror the same guarantee here.
    Profile = apps.get_model("accounts", "Profile")
    Profile.objects.get_or_create(user=user)


def remove_admin(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    username = os.environ.get("ADMIN_USERNAME")
    if username:
        User.objects.filter(username=username, is_superuser=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_admin, remove_admin),
    ]
