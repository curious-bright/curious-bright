"""Private storage for organization verification documents.

These files must never be written under ``MEDIA_ROOT`` because the deployment
serves ``/media/`` publicly. The download view performs authorization and then
streams the file from this private location.
"""
from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateMediaStorage(FileSystemStorage):
    """Filesystem storage whose location is resolved from settings at runtime."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("location", settings.PRIVATE_MEDIA_ROOT)
        kwargs.setdefault("base_url", None)
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        return ("apps.organizations.storage.PrivateMediaStorage", [], {})


private_storage = PrivateMediaStorage()
