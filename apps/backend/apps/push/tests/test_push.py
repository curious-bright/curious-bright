import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from pywebpush import WebPushException
from rest_framework.test import APIClient

from apps.push.models import ExpoPushToken, WebPushSubscription
from apps.push.services import _deliver_expo, _deliver_web, push_to_user

User = get_user_model()

PUSH_SETTINGS = {
    "PUSH_ENABLED": True,
    "VAPID_PUBLIC_KEY": "BPpublic",
    "VAPID_PRIVATE_KEY": "private",
    "VAPID_CLAIMS_EMAIL": "mailto:test@curiousbright.com.ng",
    "EXPO_PUSH_ACCESS_TOKEN": "token",
}


@override_settings(**PUSH_SETTINGS)
class PushDeliveryTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="Str0ng!Passw0rd99")
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="Str0ng!Passw0rd99")

    def inline_spawn(self):
        return patch("apps.push.services._spawn", lambda worker: worker())

    def push_inline(self, user, title, body, href="/"):
        with self.inline_spawn(), self.captureOnCommitCallbacks(execute=True):
            push_to_user(user, title, body, href=href)

    def test_disabled_push_does_nothing(self):
        WebPushSubscription.objects.create(
            user=self.alice, endpoint="https://push.example/a", p256dh="k", auth="a"
        )
        with override_settings(PUSH_ENABLED=False), patch(
            "apps.push.services.webpush"
        ) as webpush:
            push_to_user(self.alice, "t", "b", href="/x")
        webpush.assert_not_called()

    def test_push_to_user_delivers_to_snapshotted_subscriptions(self):
        WebPushSubscription.objects.create(
            user=self.alice, endpoint="https://push.example/a", p256dh="key", auth="auth"
        )
        ExpoPushToken.objects.create(
            user=self.alice, token="ExponentoToken1", platform="android"
        )
        response = MagicMock()
        response.json.return_value = {"data": [{"status": "ok", "id": "x"}]}
        with patch("apps.push.services.webpush") as webpush, patch(
            "apps.push.services.requests.post", return_value=response
        ) as post:
            self.push_inline(self.alice, "Title", "Body", href="/messages/7")
        webpush.assert_called_once()
        self.assertEqual(webpush.call_args.kwargs["vapid_private_key"], "private")
        post.assert_called_once()
        message = post.call_args.kwargs["json"]["messages"][0]
        self.assertEqual(message["data"], {"href": "/messages/7"})
        self.assertEqual(message["to"], "ExponentoToken1")

    def test_push_to_user_skips_users_without_devices(self):
        WebPushSubscription.objects.create(
            user=self.bob, endpoint="https://push.example/b", p256dh="k", auth="a"
        )
        with patch("apps.push.services.webpush") as webpush:
            self.push_inline(self.alice, "Title", "Body")
        webpush.assert_not_called()

    def test_deliver_web_prunes_expired_subscription(self):
        sub = WebPushSubscription.objects.create(
            user=self.alice, endpoint="https://push.example/a", p256dh="k", auth="a"
        )
        http_error = MagicMock()
        http_error.status_code = 410
        with patch(
            "apps.push.services.webpush",
            side_effect=WebPushException("gone", response=http_error),
        ):
            _deliver_web(
                {"id": sub.pk, "endpoint": sub.endpoint, "p256dh": "k", "auth": "a"},
                "t",
                "b",
                "/x",
            )
        self.assertEqual(WebPushSubscription.objects.count(), 0)

    def test_deliver_web_keeps_subscription_on_transient_error(self):
        sub = WebPushSubscription.objects.create(
            user=self.alice, endpoint="https://push.example/a", p256dh="k", auth="a"
        )
        http_error = MagicMock()
        http_error.status_code = 500
        with patch(
            "apps.push.services.webpush",
            side_effect=WebPushException("oops", response=http_error),
        ):
            _deliver_web(
                {"id": sub.pk, "endpoint": sub.endpoint, "p256dh": "k", "auth": "a"},
                "t",
                "b",
                "/x",
            )
        self.assertEqual(WebPushSubscription.objects.count(), 1)

    def test_deliver_expo_deletes_unregistered_tokens(self):
        good = ExpoPushToken.objects.create(
            user=self.alice, token="ExpoGood", platform="ios"
        )
        dead = ExpoPushToken.objects.create(
            user=self.alice, token="ExpoDead", platform="android"
        )
        response = MagicMock()
        response.json.return_value = {
            "data": [
                {"status": "ok", "id": "x"},
                {
                    "status": "error",
                    "message": "The token is unregistered",
                    "details": {"error": "DeviceNotRegistered"},
                },
            ]
        }
        with patch("apps.push.services.requests.post", return_value=response):
            _deliver_expo(
                [
                    {"id": good.pk, "token": "ExpoGood", "platform": "ios"},
                    {"id": dead.pk, "token": "ExpoDead", "platform": "android"},
                ],
                "t",
                "b",
                "/x",
            )
        self.assertEqual(
            list(ExpoPushToken.objects.values_list("token", flat=True)), ["ExpoGood"]
        )

    def test_deliver_expo_chunks_over_one_hundred(self):
        rows = [
            {"id": i, "token": f"Expo{i}", "platform": "android"} for i in range(101)
        ]
        response = MagicMock()
        response.json.return_value = {"data": [{"status": "ok", "id": "x"} for _ in rows]}
        with patch("apps.push.services.requests.post", return_value=response) as post:
            _deliver_expo(rows, "t", "b", "/x")
        self.assertEqual(post.call_count, 2)
        sizes = [
            len(call.kwargs["json"]["messages"]) for call in post.call_args_list
        ]
        self.assertEqual(sizes, [100, 1])

    def test_deliver_expo_needs_an_access_token(self):
        ExpoPushToken.objects.create(user=self.alice, token="Expo1", platform="android")
        with override_settings(EXPO_PUSH_ACCESS_TOKEN=""), patch(
            "apps.push.services.requests.post"
        ) as post:
            _deliver_expo([{"id": 1, "token": "Expo1", "platform": "android"}], "t", "b", "/x")
        post.assert_not_called()

    def test_deliver_expo_targets_the_default_android_channel(self):
        response = MagicMock()
        response.json.return_value = {"data": [{"status": "ok", "id": "x"}]}
        with patch("apps.push.services.requests.post", return_value=response) as post:
            _deliver_expo([{"id": 1, "token": "Expo1", "platform": "android"}], "t", "b", "/x")
        message = post.call_args.kwargs["json"]["messages"][0]
        self.assertEqual(message["channelId"], "default")
        self.assertEqual(message["sound"], "default")


@override_settings(**PUSH_SETTINGS)
class PushAPIEndpointTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="Str0ng!Passw0rd99")
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)

    def test_web_subscription_upsert_and_delete(self):
        payload = {
            "endpoint": "https://push.example/a",
            "p256dh": "key",
            "auth": "auth",
        }
        response = self.client.post("/api/push/web-subscriptions/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.client.post("/api/push/web-subscriptions/", payload, format="json")
        self.assertEqual(WebPushSubscription.objects.count(), 1)

        response = self.client.delete(
            "/api/push/web-subscriptions/", {"endpoint": payload["endpoint"]}, format="json"
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(WebPushSubscription.objects.count(), 0)

    def test_web_subscription_requires_fields(self):
        response = self.client.post(
            "/api/push/web-subscriptions/", {"endpoint": "https://x"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_expo_token_upsert(self):
        response = self.client.post(
            "/api/push/expo-tokens/",
            {"token": "Expoabc", "platform": "Android"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        record = ExpoPushToken.objects.get(token="Expoabc")
        self.assertEqual(record.platform, "android")
        self.assertEqual(record.user, self.alice)

    def test_expo_token_rejects_unknown_platform(self):
        response = self.client.post(
            "/api/push/expo-tokens/", {"token": "Expoabc", "platform": "web"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_vapid_public_key(self):
        response = self.client.get("/api/push/vapid-public-key/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["key"], "BPpublic")

    def test_vapid_public_key_unauthenticated_is_allowed(self):
        anon = APIClient()
        self.assertEqual(anon.get("/api/push/vapid-public-key/").status_code, 200)

    def test_vapid_public_key_disabled(self):
        with override_settings(VAPID_PUBLIC_KEY=""):
            response = self.client.get("/api/push/vapid-public-key/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "push_disabled")

    def test_push_test_needs_a_registered_device(self):
        with patch("apps.push.services.push_to_user") as push:
            response = self.client.post("/api/push/test/", {}, format="json")
        self.assertEqual(response.status_code, 409, response.content)
        self.assertEqual(response.json()["code"], "no_device")
        push.assert_not_called()

    def test_push_test_queues_to_the_caller(self):
        ExpoPushToken.objects.create(user=self.alice, token="Expoabc", platform="android")
        with patch("apps.push.services.push_to_user") as push:
            response = self.client.post("/api/push/test/", {}, format="json")
        self.assertEqual(response.status_code, 202, response.content)
        push.assert_called_once()
        self.assertEqual(push.call_args.args[0], self.alice)

    def test_push_test_disabled_on_server(self):
        ExpoPushToken.objects.create(user=self.alice, token="Expoabc", platform="android")
        with override_settings(PUSH_ENABLED=False), patch(
            "apps.push.services.push_to_user"
        ) as push:
            response = self.client.post("/api/push/test/", {}, format="json")
        self.assertEqual(response.status_code, 503)
        push.assert_not_called()


@override_settings(**PUSH_SETTINGS)
class PushHookTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="Str0ng!Passw0rd99")
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="Str0ng!Passw0rd99")
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)

    def test_dm_send_pushes_recipient_not_sender(self):
        with patch("apps.messaging.views.push_to_user") as push:
            response = self.client.post(
                "/api/messages/conversations/",
                {"username": "bob", "message": "Hi Bob"},
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.content)
        push.assert_called_once()
        self.assertEqual(push.call_args.args[0], self.bob)
        self.assertTrue(push.call_args.kwargs["href"].startswith("/messages/"))

    def test_second_dm_message_pushes_recipient(self):
        summary = self.client.post(
            "/api/messages/conversations/", {"username": "bob"}, format="json"
        ).json()
        with patch("apps.messaging.views.push_to_user") as push:
            response = self.client.post(
                f"/api/messages/conversations/{summary['id']}/messages/",
                {"body": "still there?"},
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.content)
        push.assert_called_once()
        self.assertEqual(push.call_args.args[0], self.bob)

    def test_notify_hook_pushes_once(self):
        from apps.community.models import Notification
        from apps.community.notifications import notify

        with patch("apps.push.services.push_to_user") as push:
            notify(self.bob, Notification.VERB.FOLLOW, actor=self.alice, text="x")
        push.assert_called_once()
        self.assertEqual(push.call_args.args[0], self.bob)
        self.assertEqual(push.call_args.kwargs["href"], "/notifications")

    def test_badge_award_pushes(self):
        from apps.gamification.services import award_badge

        # "teacher" is seeded by gamification migration 0002.
        with patch("apps.push.services.push_to_user") as push:
            award_badge(self.bob, "teacher", actor=self.alice)
        push.assert_called_once()
        self.assertIn("Teacher", push.call_args.args[2])
