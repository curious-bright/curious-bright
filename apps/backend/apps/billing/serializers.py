from rest_framework import serializers

from .models import OrganizationSubscription, Payment
from .plans import CURRENCIES


class PaymentSerializer(serializers.ModelSerializer):
    organization = serializers.CharField(source="organization.slug", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    interval = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "reference", "organization", "organization_name", "plan_code",
            "amount", "currency", "interval", "status", "authorization_url",
            "paid_at", "created_at",
        ]
        read_only_fields = fields

    def get_interval(self, obj):
        return (obj.metadata or {}).get("interval", "month")


class CheckoutSerializer(serializers.Serializer):
    organization = serializers.CharField(max_length=80)
    # Every non-custom tier is purchasable. Validation of the actual plan is
    # done against the plan catalogue so new DB tiers work without a deploy.
    plan_code = serializers.CharField(max_length=40)
    currency = serializers.ChoiceField(choices=CURRENCIES, default="NGN")
    interval = serializers.ChoiceField(
        choices=["month", "year"], default="month"
    )


class OrganizationSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationSubscription
        fields = [
            "plan_code", "status", "amount", "currency", "auto_renew",
            "current_period_start", "current_period_end", "canceled_at",
        ]
        read_only_fields = fields
