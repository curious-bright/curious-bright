from django.conf import settings
from django.db import models

from apps.core.models import SoftDeleteModel


class ResearchDocument(SoftDeleteModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="research_documents")
    title = models.CharField(max_length=300)
    abstract = models.TextField(blank=True)
    body = models.TextField(blank=True)
    field = models.CharField(max_length=120, blank=True, help_text="e.g. Mathematics, Physics, Biology")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    organization = models.ForeignKey(
        "organizations.Organization",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="research_documents",
    )
    attachment = models.FileField(upload_to="research_attachments/%Y/%m/", null=True, blank=True)
    attachment_name = models.CharField(max_length=255, blank=True)
    is_edited = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        default_manager_name = "objects"
        base_manager_name = "all_objects"

    def __str__(self):
        return self.title


class Collaboration(models.Model):
    class Role(models.TextChoices):
        CO_AUTHOR = "co_author", "Co-author"
        REVIEWER = "reviewer", "Reviewer"

    class Status(models.TextChoices):
        INVITED = "invited", "Invited"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"

    document = models.ForeignKey(ResearchDocument, on_delete=models.CASCADE, related_name="collaborations")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="collaborations")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CO_AUTHOR)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INVITED)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="invites_sent"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["document", "user"], name="unique_collab_per_document_user"),
        ]

    def __str__(self):
        return f"{self.user.username} on '{self.document.title}'"


class ResearchDocumentRevision(models.Model):
    document = models.ForeignKey(ResearchDocument, on_delete=models.CASCADE, related_name="revisions")
    editor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="research_edits")
    summary = models.CharField(max_length=300, blank=True)
    # Snapshot of the content as of this revision, so history is restorable.
    title = models.CharField(max_length=300, blank=True)
    abstract = models.TextField(blank=True)
    body = models.TextField(blank=True)
    field = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Edit of '{self.document.title}' by {self.editor.username}"
