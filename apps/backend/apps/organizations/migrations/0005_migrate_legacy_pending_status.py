from django.db import migrations


def forwards(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Verification = apps.get_model("organizations", "OrganizationVerification")

    for org in Organization.objects.filter(verification_status="pending").iterator():
        verification = Verification.objects.filter(organization_id=org.pk).first()
        new_status = (
            "pending_review"
            if verification and verification.official_email_verified_at
            else "email_pending"
        )
        Organization.objects.filter(pk=org.pk).update(verification_status=new_status)

    for verification in Verification.objects.exclude(country="").iterator():
        Organization.objects.filter(
            pk=verification.organization_id, country=""
        ).update(country=verification.country)


def backwards(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Organization.objects.filter(
        verification_status__in=["email_pending", "pending_review"]
    ).update(verification_status="pending")


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0004_organization_country_organization_suspension_reason_and_more"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
