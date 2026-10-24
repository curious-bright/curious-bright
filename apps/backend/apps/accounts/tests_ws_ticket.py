from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import caches
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.ws_tickets import consume_ws_ticket, issue_ws_ticket
from config.asgi import application

User = get_user_model()


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class WebSocketTicketTests(TestCase):
    def setUp(self):
        caches["ws_tickets"].clear()
        self.user = User.objects.create_user(
            username="ticketuser",
            email="ticket@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client = APIClient()

    def test_ticket_endpoint_requires_authentication(self):
        response = self.client.post("/api/auth/ws-ticket/")
        self.assertEqual(response.status_code, 401)

    def test_ticket_endpoint_returns_a_short_lived_ticket(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/auth/ws-ticket/")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["ticket"])
        self.assertEqual(body["expires_in"], settings.WS_TICKET_TTL_SECONDS)
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_ticket_can_only_be_consumed_once(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/auth/ws-ticket/")
        ticket = response.json()["ticket"]

        self.assertEqual(consume_ws_ticket(ticket), self.user.pk)
        self.assertIsNone(consume_ws_ticket(ticket))

    def test_unknown_ticket_is_rejected(self):
        self.assertIsNone(consume_ws_ticket("not-a-real-ticket"))
        self.assertIsNone(consume_ws_ticket(""))

    def test_ticket_is_bound_to_the_requesting_user(self):
        ticket = issue_ws_ticket(self.user.pk)
        self.assertEqual(consume_ws_ticket(ticket), self.user.pk)


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class WebSocketTicketHandshakeTests(TransactionTestCase):
    def setUp(self):
        caches["ws_tickets"].clear()
        self.user = User.objects.create_user(
            username="tickethandshake",
            email="handshake@example.com",
            password="Str0ng!Passw0rd99",
        )

    def _communicator(self, ticket):
        return WebsocketCommunicator(
            application,
            f"/ws/notifications/?ticket={ticket}",
            headers=[(b"origin", b"http://localhost:5173")],
        )

    def test_ticket_authenticates_the_websocket(self):
        async def scenario():
            communicator = self._communicator(issue_ws_ticket(self.user.pk))
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            message = await communicator.receive_json_from()
            self.assertEqual(message["event"], "connected")
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_replayed_ticket_is_rejected(self):
        ticket = issue_ws_ticket(self.user.pk)

        async def scenario():
            first = self._communicator(ticket)
            connected, _ = await first.connect()
            self.assertTrue(connected)
            await first.disconnect()

            second = self._communicator(ticket)
            connected, code = await second.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4401)

        async_to_sync(scenario)()
