import hashlib
import hmac
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.billing.models import OrganizationSubscription, Payment, WebhookEvent
from apps.organizations.models import Organization, OrganizationMembership

User = get_user_model()

SECRET = "sk_test_billing"


@override_settings(PAYSTACK_SECRET_KEY=SECRET)
class BillingAPITests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", email="owner@school.edu")
        self.other = User.objects.create_user(username="other", email="other@school.edu")
        self.org = Organization.objects.create(name="Greenfield", owner=self.owner)
        OrganizationMembership.objects.create(
            organization=self.org, user=self.owner, role=OrganizationMembership.Role.OWNER
        )
        self.client = APIClient()

    def checkout(self, **overrides):
        self.client.force_authenticate(user=self.owner)
        payload = {
            "organization": self.org.slug,
            "plan_code": "pro",
            "currency": "NGN",
            **overrides,
        }
        return self.client.post("/api/billing/checkout/", payload, format="json")

    def webhook(self, event, data, secret=SECRET, signature=None, client=None):
        body = json.dumps({"event": event, "data": data}).encode()
        sig = signature or hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
        return (client or self.client).post(
            "/api/billing/webhook/paystack/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )

    def test_plans_listing_defaults_to_ngn_and_supports_usd(self):
        response = self.client.get("/api/billing/plans/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["currency"], "NGN")
        pro = next(plan for plan in body["plans"] if plan["code"] == "pro")
        self.assertEqual(pro["amount"], 500000)
        self.assertEqual(pro["amount_display"], "₦5,000")

        usd = self.client.get("/api/billing/plans/?currency=usd").json()
        self.assertEqual(usd["currency"], "USD")
        self.assertEqual(
            next(plan for plan in usd["plans"] if plan["code"] == "pro")["amount"], 1200
        )

    def test_annual_plan_pricing_and_metadata(self):
        response = self.client.get("/api/billing/plans/?currency=NGN&interval=year")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["interval"], "year")
        plan = next(row for row in body["plans"] if row["code"] == "university") if any(
            row["code"] == "university" for row in body["plans"]
        ) else next(row for row in body["plans"] if row["code"] == "pro")
        self.assertEqual(plan["interval"], "year")
        self.assertGreater(plan["amount"], 0)

        with patch("apps.billing.views.initialize_transaction") as initialize:
            initialize.return_value = {"authorization_url": "https://checkout.paystack.com/year"}
            response = self.checkout(plan_code=plan["code"], interval="year")
        self.assertEqual(response.status_code, 201, response.content)
        payment = Payment.objects.get()
        self.assertEqual(payment.metadata["interval"], "year")
        self.assertEqual(
            initialize.call_args.kwargs["metadata"]["interval"], "year"
        )

    def test_unknown_plan_or_currency_is_rejected(self):
        response = self.checkout(plan_code="not-a-plan")
        self.assertIn(response.status_code, (400, 404))
        self.assertEqual(set(response.json()), {"code", "message"})
        response = self.checkout(currency="GBP")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "validation_error")

    def test_checkout_requires_login(self):
        response = APIClient().post(
            "/api/billing/checkout/",
            {"organization": self.org.slug, "plan_code": "pro", "currency": "NGN"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_only_owner_can_checkout(self):
        admin = User.objects.create_user(username="admin", email="admin@school.edu")
        OrganizationMembership.objects.create(
            organization=self.org, user=admin, role=OrganizationMembership.Role.ADMIN
        )
        self.client.force_authenticate(user=admin)
        response = self.client.post(
            "/api/billing/checkout/",
            {"organization": self.org.slug, "plan_code": "pro", "currency": "NGN"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    @patch("apps.billing.views.initialize_transaction")
    def test_checkout_creates_pending_payment_and_returns_checkout_url(self, initialize):
        initialize.return_value = {
            "authorization_url": "https://checkout.paystack.com/abc",
            "access_code": "access",
            "reference": "cb_ref",
        }
        response = self.checkout()
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "pending")
        self.assertEqual(body["authorization_url"], "https://checkout.paystack.com/abc")
        payment = Payment.objects.get(reference=body["reference"])
        self.assertEqual(payment.amount, 500000)
        self.assertEqual(payment.currency, "NGN")
        initialize.assert_called_once()
        self.assertEqual(initialize.call_args.kwargs["amount"], 500000)

    def test_checkout_without_provider_config_returns_503(self):
        with override_settings(PAYSTACK_SECRET_KEY=""):
            response = self.checkout()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "billing_not_configured")
        self.assertFalse(Payment.objects.exists())

    @patch("apps.billing.views.initialize_transaction")
    def test_provider_failure_is_reported(self, initialize):
        from apps.billing.services import PaystackError

        initialize.side_effect = PaystackError("down")
        response = self.checkout()
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["code"], "payment_provider_error")
        self.assertEqual(Payment.objects.get().status, Payment.Status.FAILED)

    def test_webhook_rejects_missing_or_bad_signature(self):
        response = self.webhook("charge.success", {"reference": "nope"}, signature="bad")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "invalid_signature")

    def test_webhook_charge_success_activates_subscription(self):
        payment = Payment.objects.create(
            organization=self.org,
            created_by=self.owner,
            plan_code="pro",
            amount=500000,
            currency="NGN",
        )
        response = self.webhook(
            "charge.success",
            {
                "reference": payment.reference,
                "amount": 500000,
                "currency": "NGN",
                "id": 12345,
            },
        )
        self.assertEqual(response.status_code, 200)
        payment.refresh_from_db()
        self.org.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.SUCCESS)
        self.assertIsNotNone(payment.paid_at)
        self.assertEqual(self.org.plan_tier, Organization.Plan.PRO)
        self.assertEqual(self.org.subscription_status, Organization.SubscriptionStatus.ACTIVE)
        self.assertEqual(self.org.seat_limit, 500)
        subscription = OrganizationSubscription.objects.get(organization=self.org)
        self.assertEqual(subscription.plan_code, "pro")
        self.assertEqual(subscription.status, OrganizationSubscription.Status.ACTIVE)
        self.assertTrue(self.org.audit_logs.filter(action="subscription.activated").exists())
        self.assertEqual(WebhookEvent.objects.get().status, WebhookEvent.Status.PROCESSED)

    def test_webhook_is_idempotent(self):
        payment = Payment.objects.create(
            organization=self.org,
            created_by=self.owner,
            plan_code="pro",
            amount=500000,
            currency="NGN",
        )
        data = {"reference": payment.reference, "amount": 500000, "currency": "NGN"}
        self.assertEqual(self.webhook("charge.success", data).status_code, 200)
        second = self.webhook("charge.success", data)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json().get("duplicate"))
        self.assertEqual(
            self.org.audit_logs.filter(action="subscription.activated").count(), 1
        )
        self.assertEqual(WebhookEvent.objects.count(), 1)

    def test_webhook_amount_mismatch_does_not_activate(self):
        payment = Payment.objects.create(
            organization=self.org,
            created_by=self.owner,
            plan_code="pro",
            amount=500000,
            currency="NGN",
        )
        response = self.webhook(
            "charge.success",
            {"reference": payment.reference, "amount": 100, "currency": "NGN"},
        )
        self.assertEqual(response.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.org.refresh_from_db()
        self.assertEqual(self.org.plan_tier, Organization.Plan.FREE)
        self.assertEqual(WebhookEvent.objects.get().status, WebhookEvent.Status.ERROR)

    def test_webhook_without_config_returns_503(self):
        with override_settings(PAYSTACK_SECRET_KEY="", PAYSTACK_WEBHOOK_SECRET=""):
            response = self.webhook("charge.success", {"reference": "x"}, secret="")
        self.assertEqual(response.status_code, 503)

    def test_webhook_ignores_unknown_payment(self):
        response = self.webhook(
            "charge.success", {"reference": "missing", "amount": 1, "currency": "NGN"}
        )
        self.assertEqual(response.status_code, 200)
        event = WebhookEvent.objects.get()
        self.assertEqual(event.status, WebhookEvent.Status.IGNORED)

    @patch("apps.billing.views.verify_transaction")
    def test_verify_endpoint_activates_payment(self, verify):
        payment = Payment.objects.create(
            organization=self.org,
            created_by=self.owner,
            plan_code="pro",
            amount=500000,
            currency="NGN",
        )
        verify.return_value = {
            "status": "success",
            "reference": payment.reference,
            "amount": 500000,
            "currency": "NGN",
        }
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(f"/api/billing/payments/{payment.reference}/verify/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.assertEqual(
            OrganizationSubscription.objects.get(organization=self.org).plan_code, "pro"
        )

    def test_payment_detail_is_private_to_org_members(self):
        payment = Payment.objects.create(
            organization=self.org,
            created_by=self.owner,
            plan_code="pro",
            amount=500000,
            currency="NGN",
        )
        self.client.force_authenticate(user=self.other)
        self.assertEqual(
            self.client.get(f"/api/billing/payments/{payment.reference}/").status_code, 403
        )
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(
            self.client.get(f"/api/billing/payments/{payment.reference}/").status_code, 200
        )

    def test_organization_subscription_view(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/organizations/{self.org.slug}/subscription/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["plan_tier"], "free")
        self.assertIsNone(body["subscription"])
        self.client.force_authenticate(user=self.other)
        self.assertEqual(
            self.client.get(f"/api/organizations/{self.org.slug}/subscription/").status_code, 404
        )

    @patch("apps.billing.views.initialize_transaction")
    def test_subscribe_compatibility_endpoint(self, initialize):
        initialize.return_value = {"authorization_url": "https://checkout.paystack.com/x"}
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/subscribe/", {"plan": "pro"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Payment.objects.get().plan_code, "pro")
