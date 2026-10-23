from django.test import TestCase, override_settings


class InstitutionalCorsTests(TestCase):
    @override_settings(CORS_ALLOWED_ORIGINS=["https://org.curiousbright.com.ng"])
    def test_preflight_allows_institutional_client_header(self):
        response = self.client.options(
            "/api/auth/token/",
            HTTP_ORIGIN="https://org.curiousbright.com.ng",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,x-client-app",
        )
        self.assertEqual(response.status_code, 200)
        allowed = {
            header.strip().lower()
            for header in response["Access-Control-Allow-Headers"].split(",")
        }
        self.assertIn("x-client-app", allowed)
