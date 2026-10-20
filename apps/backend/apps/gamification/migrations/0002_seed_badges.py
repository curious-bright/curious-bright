"""Seed the default badges (Teacher, Solver, Collaborator)."""
from django.db import migrations

BADGES = [
    {
        "code": "teacher",
        "name": "Teacher",
        "description": "Earned when your answer is marked helpful or accepted by someone you helped.",
        "icon": "graduation-cap",
    },
    {
        "code": "solver",
        "name": "Solver",
        "description": "Earned when a problem you worked on is confirmed solved.",
        "icon": "puzzle",
    },
    {
        "code": "collaborator",
        "name": "Collaborator",
        "description": "Earned when you contribute to a research document with co-authors.",
        "icon": "users",
    },
]


def seed_badges(apps, schema_editor):
    Badge = apps.get_model("gamification", "Badge")
    for badge in BADGES:
        Badge.objects.get_or_create(
            code=badge["code"],
            defaults={k: v for k, v in badge.items() if k != "code"},
        )


def unseed_badges(apps, schema_editor):
    Badge = apps.get_model("gamification", "Badge")
    Badge.objects.filter(code__in=[b["code"] for b in BADGES]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("gamification", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_badges, unseed_badges),
    ]
