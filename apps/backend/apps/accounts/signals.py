from django.conf import settings
from django.db.models import F
from django.db.models.functions import Greatest
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Follow, Profile


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_profile(sender, instance, created, **kwargs):
    """Every user gets a Profile automatically (including the deploy admin)."""
    if created:
        Profile.objects.get_or_create(user=instance)


@receiver(post_save, sender=Follow)
def inc_follow_counts(sender, instance, created, **kwargs):
    if created:
        Profile.objects.filter(user=instance.followed).update(
            followers_count=F("followers_count") + 1
        )
        Profile.objects.filter(user=instance.follower).update(
            following_count=F("following_count") + 1
        )


@receiver(post_delete, sender=Follow)
def dec_follow_counts(sender, instance, **kwargs):
    # Greatest(..., 0) keeps counters correct even if a legacy row was
    # double-deleted before signals were reliable.
    Profile.objects.filter(user=instance.followed).update(
        followers_count=Greatest(F("followers_count") - 1, 0)
    )
    Profile.objects.filter(user=instance.follower).update(
        following_count=Greatest(F("following_count") - 1, 0)
    )
