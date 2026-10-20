from django.apps import AppConfig


class ResearchConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.research"

    def ready(self):
        import apps.research.signals  # noqa: F401
