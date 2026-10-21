from rest_framework import serializers

from .models import OrganizationSubscription, Payment
from .plans import CURRENCIES


class PaymentSerializer(serializers.ModelSerializer):
    organization = serializers.CharField(source="organization.slug", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "reference", "organization", "organization_name", "plan_code",
            "amount", "currency", "status", "authorization_url",
            "paid_at", "created_at",
        ]
        read_only_fields = fields


class CheckoutSerializer(serializers.Serializer):
    organization = serializers.CharField(max_length=80)
    plan_code = serializers.ChoiceField(choices=["pro", "enterprise"])
    currency = serializers.ChoiceField(choices=CURRENCIES, default="NGN")


class OrganizationSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationSubscription
        fields = [
            "plan_code", "status", "amount", "currency", "auto_renew",
            "current_period_start", "current_period_end", "canceled_at",
        ]
        read_only_fields = fields
