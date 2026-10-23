"""Upload validation for private verification documents."""
from pathlib import Path

from django.core.exceptions import ValidationError

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
SIGNATURES = (b"%PDF", b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


def validate_verification_document(upload):
    if upload is None:
        return upload
    if upload.size > MAX_DOCUMENT_BYTES:
        raise ValidationError("Verification documents must be 10 MB or smaller.")

    extension = Path(getattr(upload, "name", "")).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationError("Upload a PDF, JPEG or PNG verification document.")

    content_type = (getattr(upload, "content_type", "") or "").lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationError("Upload a PDF, JPEG or PNG verification document.")

    # Trust the file signature, not the browser-supplied MIME type.
    position = upload.tell() if hasattr(upload, "tell") else 0
    header = upload.read(8)
    if hasattr(upload, "seek"):
        upload.seek(position)
    if not any(header.startswith(signature) for signature in SIGNATURES):
        raise ValidationError("That file does not look like a valid PDF or image.")
    return upload


def verification_document_path(instance, filename):
    org_id = getattr(instance, "organization_id", None) or "unknown"
    return f"organization-verification/{org_id}/{filename}"
