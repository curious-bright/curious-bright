from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Organization, OrganizationInvitation, OrganizationMembership

User = get_user_model()


@receiver(post_save, sender=User)
def link_pending_invitations(sender, instance, created, **kwargs):
    """New accounts automatically join organizations that invited their email
    (or, when enabled, organizations that own their email domain)."""
    if not created or not instance.email:
        return

    now = timezone.now()
    invitations = OrganizationInvitation.objects.filter(
        email__iexact=instance.email,
        accepted_at__isnull=True,
        revoked_at__isnull=True,
        expires_at__gt=now,
    ).select_related("organization")

    for invitation in invitations:
        org = invitation.organization
        if not org.is_active:
            continue
        if org.seat_limit and org.seats_used >= org.seat_limit:
            continue
        membership = org.memberships.filter(user=instance).first()
        if membership is None:
            OrganizationMembership.objects.create(
                organization=org,
                user=instance,
                role=invitation.role,
                status=OrganizationMembership.Status.ACTIVE,
                invited_by=invitation.invited_by,
            )
        invitation.accepted_at = now
        invitation.accepted_by = instance
        invitation.save(update_fields=["accepted_at", "accepted_by"])

    domain = instance.email.rsplit("@", 1)[-1].lower()
    for org in Organization.objects.filter(domain=domain, auto_join_domain=True, is_active=True):
        if org.seat_limit and org.seats_used >= org.seat_limit:
            continue
        OrganizationMembership.objects.get_or_create(
            organization=org,
            user=instance,
            defaults={
                "role": OrganizationMembership.Role.STUDENT,
                "status": OrganizationMembership.Status.ACTIVE,
            },
        )
