import hashlib
import json
import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organization, OrganizationMembership

from .models import OrganizationSubscription, Payment, WebhookEvent, new_reference
from .plans import amount_for, detect_currency_from_request, get_plan, plans_payload
from .serializers import CheckoutSerializer, OrganizationSubscriptionSerializer, PaymentSerializer
from .services import (
    BillingNotConfigured,
    PaystackError,
    complete_payment,
    fail_payment,
    initialize_transaction,
    process_webhook_event,
    valid_webhook_signature,
    verify_transaction,
)

logger = logging.getLogger(__name__)


def _is_owner_or_staff(user, org):
    if user.is_staff:
        return True
    return org.memberships.filter(
        user=user,
        role=OrganizationMembership.Role.OWNER,
        status=OrganizationMembership.Status.ACTIVE,
    ).exists()


def _member_can_view(request, payment):
    if request.user.is_staff or payment.created_by_id == request.user.id:
        return True
    return payment.organization.memberships.filter(
        user=request.user, status=OrganizationMembership.Status.ACTIVE
    ).exists()


def _checkout(request, data):
    org = get_object_or_404(Organization, slug=data["organization"], is_active=True)
    if not _is_owner_or_staff(request.user, org):
        return Response(
            {"code": "forbidden", "message": "Only the organization owner can manage billing."},
            status=status.HTTP_403_FORBIDDEN,
        )

    plan = get_plan(data["plan_code"])
    if plan is None or plan["custom"]:
        return Response(
            {"code": "plan_not_purchasable", "message": "Contact us for enterprise pricing."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    currency = data["currency"]
    interval = data.get("interval", "month")
    price = amount_for(plan["code"], currency, interval=interval)
    if price <= 0:
        return Response(
            {"code": "plan_not_purchasable", "message": "That plan is not available in this currency."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not getattr(settings, "PAYSTACK_SECRET_KEY", ""):
        return Response(
            {"code": "billing_not_configured", "message": "Payments are not configured yet."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    reference = new_reference()
    payment = Payment.objects.create(
        reference=reference,
        organization=org,
        created_by=request.user,
        plan_code=plan["code"],
        amount=price,
        currency=currency,
        metadata={"organization": org.slug, "plan": plan["code"], "interval": interval, "user_id": request.user.pk},
    )
    callback = getattr(
        settings,
        "BILLING_CALLBACK_URL",
        f"{getattr(settings, 'APP_FRONTEND_URL', 'https://app.curiousbright.com.ng')}/payment/verify",
    )
    try:
        provider = initialize_transaction(
            email=request.user.email,
            amount=price,
            currency=currency,
            reference=reference,
            callback_url=callback,
            metadata=payment.metadata,
        )
    except BillingNotConfigured:
        fail_payment(payment, "not_configured")
        return Response(
            {"code": "billing_not_configured", "message": "Payments are not configured yet."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except PaystackError:
        fail_payment(payment, "provider_error")
        logger.exception("Could not initialize Paystack payment %s", reference)
        return Response(
            {"code": "payment_provider_error", "message": "Could not start the payment. Try again shortly."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    payment.authorization_url = provider.get("authorization_url", "")
    payment.access_code = provider.get("access_code", "")
    payment.provider_reference = provider.get("reference", "")
    payment.save(
        update_fields=["authorization_url", "access_code", "provider_reference", "updated_at"]
    )
    return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class PlansView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request):
        currency = detect_currency_from_request(request)
        interval = (request.query_params.get("interval") or "month").lower()
        return Response(plans_payload(currency, interval=interval))


class CheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _checkout(request, serializer.validated_data)


class OrganizationSubscribeView(APIView):
    """Compatibility entry point used by the institutional dashboard."""

    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        serializer = CheckoutSerializer(
            data={
                "organization": slug,
                "plan_code": request.data.get("plan_code") or request.data.get("plan") or "pro",
                "currency": request.data.get("currency") or "NGN",
                "interval": request.data.get("interval") or "month",
            }
        )
        serializer.is_valid(raise_exception=True)
        return _checkout(request, serializer.validated_data)


class PaymentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, reference):
        payment = get_object_or_404(
            Payment.objects.select_related("organization"), reference=reference
        )
        if not _member_can_view(request, payment):
            return Response(
                {"code": "forbidden", "message": "You cannot view that payment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(PaymentSerializer(payment).data)


class VerifyPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, reference):
        payment = get_object_or_404(
            Payment.objects.select_related("organization"), reference=reference
        )
        if not _member_can_view(request, payment):
            return Response(
                {"code": "forbidden", "message": "You cannot verify that payment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if payment.status == Payment.Status.SUCCESS:
            return Response(PaymentSerializer(payment).data)
        if not getattr(settings, "PAYSTACK_SECRET_KEY", ""):
            return Response(
                {"code": "billing_not_configured", "message": "Payments are not configured yet."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            provider = verify_transaction(payment.reference)
        except BillingNotConfigured:
            return Response(
                {"code": "billing_not_configured", "message": "Payments are not configured yet."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except PaystackError:
            logger.exception("Could not verify Paystack payment %s", reference)
            return Response(
                {"code": "payment_provider_error", "message": "Could not verify the payment yet."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        state = (provider.get("status") or "").lower()
        if state == "success":
            _, error = complete_payment(payment, provider)
            if error:
                return Response(
                    {"code": error, "message": "The payment did not match this order."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif state in ("failed", "abandoned", "reversed"):
            fail_payment(payment, state)
        payment.refresh_from_db()
        return Response(PaymentSerializer(payment).data)


class PaystackWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def post(self, request):
        raw = request.body
        if not getattr(settings, "PAYSTACK_SECRET_KEY", "") and not getattr(
            settings, "PAYSTACK_WEBHOOK_SECRET", ""
        ):
            return Response(
                {"code": "billing_not_configured", "message": "Payments are not configured yet."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        signature = request.headers.get("X-Paystack-Signature", "")
        if not valid_webhook_signature(raw, signature):
            return Response(
                {"code": "invalid_signature", "message": "Invalid webhook signature."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return Response(
                {"code": "bad_request", "message": "Invalid webhook body."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        event_type = payload.get("event", "")
        event_id = hashlib.sha256(raw).hexdigest()
        event, created = WebhookEvent.objects.get_or_create(
            provider="paystack",
            event_id=event_id,
            defaults={"event_type": event_type, "payload": payload},
        )
        if not created and event.status == WebhookEvent.Status.PROCESSED:
            return Response({"status": "ok", "duplicate": True})

        result, message = process_webhook_event(event_type, payload.get("data") or {})
        event.status = result
        event.error = message[:500]
        event.processed_at = timezone.now()
        event.save(update_fields=["status", "error", "processed_at"])
        return Response({"status": "ok"})


class OrganizationSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        org = get_object_or_404(Organization, slug=slug, is_active=True)
        if not request.user.is_staff and not org.memberships.filter(
            user=request.user, status=OrganizationMembership.Status.ACTIVE
        ).exists():
            return Response(
                {"code": "not_found", "message": "Organization not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        subscription = OrganizationSubscription.objects.filter(organization=org).first()
        return Response(
            {
                "organization": org.slug,
                "plan_tier": org.plan_tier,
                "subscription_status": org.subscription_status,
                "seat_limit": org.seat_limit,
                "seats_used": org.seats_used,
                "subscription": OrganizationSubscriptionSerializer(subscription).data
                if subscription
                else None,
            }
        )
