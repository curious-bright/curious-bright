import os
from urllib.parse import parse_qs

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from asgiref.sync import sync_to_async
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

from apps.accounts.ws_tickets import consume_ws_ticket
from apps.core.logging import install_access_log_redaction
from apps.realtime.routing import websocket_urlpatterns

User = get_user_model()

# Access logs run under uvicorn in production but not under every development
# server; install the redaction filter here as a safety net.
install_access_log_redaction()


@database_sync_to_async
def _user_from_id(user_id):
    try:
        return User.objects.get(id=user_id, is_active=True)
    except Exception:
        return AnonymousUser()


@database_sync_to_async
def _user_from_token(token):
    try:
        validated = AccessToken(token)
    except Exception:
        return AnonymousUser()
    try:
        return User.objects.get(id=validated["user_id"], is_active=True)
    except Exception:
        return AnonymousUser()


async def _user_from_ticket(ticket):
    user_id = await sync_to_async(consume_ws_ticket)(ticket)
    return await _user_from_id(user_id) if user_id is not None else AnonymousUser()


class JWTAuthMiddleware:
    """Authenticate a WebSocket via ``?ticket=<single-use ticket>``.

    Browsers cannot set an Authorization header on a WebSocket handshake, so
    clients first POST to ``/api/auth/ws-ticket/`` and put the short-lived,
    single-use ticket in the query string. ``?token=<access token>`` remains
    supported for one release so cached client bundles keep working; new
    clients must use tickets.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        params = parse_qs(scope.get("query_string", b"").decode())
        ticket = (params.get("ticket") or [None])[0]
        if ticket:
            scope["user"] = await _user_from_ticket(ticket)
        else:
            token = (params.get("token") or [None])[0]
            scope["user"] = (
                await _user_from_token(token) if token else AnonymousUser()
            )
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
