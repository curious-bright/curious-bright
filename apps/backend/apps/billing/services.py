import hashlib
import hmac
import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.organizations.models import OrganizationMembership
from apps.organizations.services import audit

from .models import OrganizationSubscription, Payment
from .plans import amount_for, get_plan

logger = logging.getLogger(__name__)


class BillingNotConfigured(Exception):
    pass


class PaystackError(Exception):
    def __init__(self, message, data=None):
        super().__init__(message)
        self.message = message
        self.data = data


def paystack_request(method, path, payload=None):
    secret = getattr(settings, "PAYSTACK_SECRET_KEY", "")
    if not secret:
        raise BillingNotConfigured("Paystack is not configured.")
    base = getattr(settings, "PAYSTACK_API_BASE", "https://api.paystack.co").rstrip("/")
    try:
        response = requests.request(
            method,
            f"{base}{path}",
            json=payload,
            headers={
                "Authorization": f"Bearer {secret}",
                "Content-Type": "application/json",
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        logger.warning("Paystack request failed: %s", exc)
        raise PaystackError("The payment provider is unavailable.") from exc

    try:
        body = response.json()
    except ValueError:
        body = {}
    if not response.ok or not body.get("status"):
        raise PaystackError(body.get("message") or "The payment provider rejected the request.", body)
    return body.get("data") or {}


def initialize_transaction(*, email, amount, currency, reference, callback_url, metadata=None):
    return paystack_request(
        "POST",
        "/transaction/initialize",
        {
            "email": email,
            "amount": amount,
            "currency": currency,
            "reference": reference,
            "callback_url": callback_url,
            "metadata": metadata or {},
        },
    )


def verify_transaction(reference):
    return paystack_request("GET", f"/transaction/verify/{reference}")


def valid_webhook_signature(raw_body, signature):
    secret = getattr(settings, "PAYSTACK_WEBHOOK_SECRET", "") or getattr(
        settings, "PAYSTACK_SECRET_KEY", ""
    )
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


def _member_can_view(request, payment):
    if request.user.is_staff or payment.created_by_id == request.user.id:
        return True
    return payment.organization.memberships.filter(
        user=request.user, status=OrganizationMembership.Status.ACTIVE
    ).exists()


def complete_payment(payment, provider_data=None):
    """Idempotently activate a paid plan. Returns (changed, error)."""
    provider_data = provider_data or {}
    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("organization").get(pk=payment.pk)
        if payment.status == Payment.Status.SUCCESS:
            return False, None

        provider_amount = provider_data.get("amount")
        provider_currency = (provider_data.get("currency") or payment.currency).upper()
        if provider_amount is not None and int(provider_amount) != payment.amount:
            return False, "amount_mismatch"
        if provider_currency != payment.currency:
            return False, "currency_mismatch"

        plan = get_plan(payment.plan_code)
        if plan is None:
            return False, "unknown_plan"

        now = timezone.now()
        payment.status = Payment.Status.SUCCESS
        payment.paid_at = now
        payment.provider_reference = str(
            provider_data.get("reference") or provider_data.get("id") or payment.provider_reference
        )
        payment.save(update_fields=["status", "paid_at", "provider_reference", "updated_at"])

        org = payment.organization
        org.plan_tier = payment.plan_code
        org.subscription_status = org.SubscriptionStatus.ACTIVE
        if plan["seats"]:
            org.seat_limit = plan["seats"]
        org.save(update_fields=["plan_tier", "subscription_status", "seat_limit", "updated_at"])

        days = 365 if plan["interval"] == "year" else 30
        OrganizationSubscription.objects.update_or_create(
            organization=org,
            defaults={
                "plan_code": payment.plan_code,
                "status": OrganizationSubscription.Status.ACTIVE,
                "amount": payment.amount,
                "currency": payment.currency,
                "current_period_start": now,
                "current_period_end": now + timedelta(days=days),
                "canceled_at": None,
            },
        )
        audit(
            org,
            payment.created_by,
            "subscription.activated",
            payment,
            plan_code=payment.plan_code,
            amount=payment.amount,
            currency=payment.currency,
        )
        return True, None


def fail_payment(payment, reason=""):
    if payment.status != Payment.Status.PENDING:
        return
    payment.status = Payment.Status.FAILED
    payment.metadata = {**(payment.metadata or {}), "failure_reason": reason}
    payment.save(update_fields=["status", "metadata", "updated_at"])


def process_webhook_event(event_type, data):
    """Returns (status, message) for the stored WebhookEvent."""
    if event_type == "charge.success":
        payment = Payment.objects.select_related("organization").filter(
            reference=data.get("reference")
        ).first()
        if payment is None:
            return "ignored", "Payment not found."
        changed, error = complete_payment(payment, data)
        if error:
            return "error", {"amount_mismatch": "Amount mismatch.", "currency_mismatch": "Currency mismatch.", "unknown_plan": "Unknown plan."}.get(error, error)
        return ("processed", "") if changed else ("ignored", "Already processed.")

    if event_type == "charge.failed":
        payment = Payment.objects.filter(reference=data.get("reference")).first()
        if payment is None:
            return "ignored", "Payment not found."
        fail_payment(payment, data.get("gateway_response", "failed"))
        return "processed", ""

    if event_type in ("subscription.disable", "subscription.not_renew"):
        subscription = OrganizationSubscription.objects.filter(
            provider_subscription_code=data.get("subscription_code")
        ).first()
        if subscription is None:
            return "ignored", "Subscription not found."
        subscription.status = (
            OrganizationSubscription.Status.CANCELED
            if event_type == "subscription.disable"
            else subscription.status
        )
        subscription.auto_renew = False
        subscription.canceled_at = timezone.now()
        subscription.save(update_fields=["status", "auto_renew", "canceled_at", "updated_at"])
        return "processed", ""

    if event_type == "invoice.payment_failed":
        subscription = OrganizationSubscription.objects.filter(
            provider_subscription_code=data.get("subscription_code")
        ).first()
        if subscription is None:
            return "ignored", "Subscription not found."
        subscription.status = OrganizationSubscription.Status.PAST_DUE
        subscription.save(update_fields=["status", "updated_at"])
        return "processed", ""

    return "ignored", "Unhandled event."


def price_for(plan_code, currency):
    return amount_for(plan_code, currency)
