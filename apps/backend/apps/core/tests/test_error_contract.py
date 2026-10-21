from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class ErrorContractTests(TestCase):
    """Every API failure must be exactly {"code": str, "message": str}."""

    def setUp(self):
        self.client = APIClient()

    def assertErrorShape(self, response):
        body = response.json()
        self.assertEqual(set(body), {"code", "message"}, body)
        self.assertIsInstance(body["code"], str)
        self.assertIsInstance(body["message"], str)
        self.assertTrue(body["code"])
        self.assertTrue(body["message"])
        self.assertIn("X-Request-ID", response)

    def test_unauthenticated_request(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "unauthenticated")
        self.assertErrorShape(response)

    def test_invalid_token(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)
        self.assertErrorShape(response)

    def test_unknown_api_route_returns_json_not_html(self):
        response = self.client.get("/api/definitely-not-a-route/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "not_found")
        self.assertErrorShape(response)

    def test_method_not_allowed(self):
        user = User.objects.create_user(
            username="methoduser", email="method@example.com", password="Str0ng!Passw0rd99"
        )
        self.client.force_authenticate(user=user)
        response = self.client.post("/api/auth/me/")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json()["code"], "method_not_allowed")
        self.assertErrorShape(response)

    def test_invalid_login(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": "nobody", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertErrorShape(response)

    def test_validation_error_is_readable_and_has_no_details(self):
        User.objects.create_user(
            username="taken", email="taken@example.com", password="Str0ng!Passw0rd99"
        )
        response = self.client.post(
            "/api/auth/register/",
            {"username": "taken", "email": "new@example.com", "password": "Str0ng!Passw0rd99"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertIn("Username", response.json()["message"])
        self.assertErrorShape(response)

    def test_health_probe(self):
        response = self.client.get("/healthz/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_request_id_is_echoed_when_supplied(self):
        response = self.client.get("/healthz/", HTTP_X_REQUEST_ID="trace-123")
        self.assertEqual(response["X-Request-ID"], "trace-123")
