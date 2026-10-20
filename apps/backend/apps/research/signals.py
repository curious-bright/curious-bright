from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.community.notifications import notify
from apps.gamification.services import award_badge

from .models import Collaboration, ResearchDocumentRevision


@receiver(post_save, sender=ResearchDocumentRevision)
def award_on_contribution(sender, instance, created, **kwargs):
    """A co-author's contribution to a research document earns Collaborator."""
    if created:
        award_badge(instance.editor, "collaborator")


@receiver(post_save, sender=Collaboration)
def notify_accepted_collab(sender, instance, created, **kwargs):
    if not created and instance.status == Collaboration.Status.ACCEPTED:
        notify(
            instance.document.owner,
            "research",
            actor=instance.user,
            text=f"@{instance.user.username} joined '{instance.document.title}' as {instance.get_role_display()}",
        )
