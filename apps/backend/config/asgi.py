import os
from urllib.parse import parse_qs

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from channels.db import database_sync_to_async
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.core.asgi import get_asgi_application

# Initialise Django (populate the app registry) before importing any models.
django_asgi_app = get_asgi_application()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

from apps.realtime.routing import websocket_urlpatterns

User = get_user_model()


@database_sync_to_async
def _user_from_token(token):
    try:
        validated = AccessToken(token)
        return User.objects.get(id=validated["user_id"], is_active=True)
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware:
    """Authenticate a WebSocket via ``?token=<access token>``.

    Browsers cannot set an Authorization header on a WebSocket handshake, so
    the short-lived access token travels in the query string.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        token = (parse_qs(scope.get("query_string", b"").decode()).get("token") or [None])[0]
        scope["user"] = await _user_from_token(token) if token else AnonymousUser()
        return await self.inner(scope, receive, send)


application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": OriginValidator(
            JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
            getattr(settings, "WS_ALLOWED_ORIGINS", settings.CORS_ALLOWED_ORIGINS),
        ),
    }
)
