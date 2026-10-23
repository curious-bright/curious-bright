from urllib.parse import urlparse

from django.utils import timezone
from rest_framework import serializers

from .models import (
    Organization,
    OrganizationInvitation,
    OrganizationJoinRequest,
    OrganizationMembership,
    OrganizationVerification,
    OrganizationVerificationEvent,
)
from .services import domains_match
from .validators import validate_verification_document


def _avatar(user):
    profile = getattr(user, "profile", None)
    if not profile:
        return ""
    if profile.avatar:
        return profile.avatar
    if profile.avatar_file:
        try:
            return profile.avatar_file.url
        except ValueError:
            return ""
    return ""


def _expertise(user):
    profile = getattr(user, "profile", None)
    return profile.subject_expertise if profile else ""


class OrganizationSerializer(serializers.ModelSerializer):
    owner = serializers.CharField(source="owner.username", read_only=True)
    logo_url = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id", "name", "slug", "domain", "logo_url", "owner",
            "org_type", "plan_tier", "subscription_status", "seat_limit", "seats_used",
            "seats_remaining", "auto_join_domain", "allow_join_requests",
            "verification_status", "verified_at", "member_count",
            "my_role", "is_active", "created_at",
        ]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        try:
            url = obj.logo.url
        except ValueError:
            return None
        return request.build_absolute_uri(url) if request else url

    def get_member_count(self, obj):
        return obj.memberships.filter(status=OrganizationMembership.Status.ACTIVE).count()

    def get_my_role(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return None
        if user.is_staff:
            return "owner"
        return (
            obj.memberships.filter(user=user, status=OrganizationMembership.Status.ACTIVE)
            .values_list("role", flat=True)
            .first()
        )


class OrganizationSearchSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    my_membership_role = serializers.SerializerMethodField()
    my_join_request_status = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id", "name", "slug", "org_type", "domain", "logo_url",
            "member_count", "verification_status", "allow_join_requests",
            "my_membership_role", "my_join_request_status",
        ]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        try:
            url = obj.logo.url
        except ValueError:
            return None
        return request.build_absolute_uri(url) if request else url

    def get_member_count(self, obj):
        return obj.memberships.filter(status=OrganizationMembership.Status.ACTIVE).count()

    def _user(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def get_my_membership_role(self, obj):
        user = self._user()
        if not user or not user.is_authenticated:
            return None
        return (
            obj.memberships.filter(user=user, status=OrganizationMembership.Status.ACTIVE)
            .values_list("role", flat=True)
            .first()
        )

    def get_my_join_request_status(self, obj):
        user = self._user()
        if not user or not user.is_authenticated:
            return None
        return (
            obj.join_requests.filter(user=user)
            .order_by("-created_at")
            .values_list("status", flat=True)
            .first()
        )


class OrganizationVerificationSerializer(serializers.ModelSerializer):
    status = serializers.CharField(source="organization.verification_status", read_only=True)
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)
    official_email_verified = serializers.BooleanField(read_only=True)
    document_url = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
    registration_document = serializers.FileField(
        write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = OrganizationVerification
        fields = [
            "id", "organization_slug", "status", "legal_name", "org_type",
            "country", "address", "website", "official_email",
            "official_email_verified", "contact_name", "contact_role",
            "contact_email", "contact_phone", "registration_number",
            "registration_document", "document_url", "is_government_funded",
            "head_of_institution", "submitted_at", "reviewed_at",
            "rejection_reason", "attempt", "events", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "official_email_verified", "submitted_at",
            "reviewed_at", "rejection_reason", "attempt", "events",
            "created_at", "updated_at",
        ]

    def get_document_url(self, obj):
        if not obj.registration_document:
            return None
        return f"/api/organizations/{obj.organization.slug}/verification/document/"

    def get_events(self, obj):
        rows = obj.organization.verification_events.select_related("actor")[:20]
        return [
            {
                "id": row.pk,
                "action": row.action,
                "actor": row.actor.username if row.actor else "system",
                "note": row.note,
                "created_at": row.created_at,
            }
            for row in rows
        ]


class VerificationSubmitSerializer(serializers.Serializer):
    legal_name = serializers.CharField(max_length=200)
    org_type = serializers.ChoiceField(choices=Organization.OrgType.choices)
    country = serializers.CharField(max_length=100)
    address = serializers.CharField()
    website = serializers.CharField(max_length=300)
    official_email = serializers.EmailField()
    contact_name = serializers.CharField(max_length=120)
    contact_role = serializers.CharField(max_length=120)
    contact_email = serializers.EmailField()
    contact_phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    registration_number = serializers.CharField(max_length=120, required=False, allow_blank=True)
    registration_document = serializers.FileField(required=False, allow_null=True)
    is_government_funded = serializers.BooleanField(default=False)
    head_of_institution = serializers.CharField(max_length=160, required=False, allow_blank=True)

    def validate_website(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("A website is required for verification.")
        if not value.startswith(("http://", "https://")):
            value = f"https://{value}"
        parsed = urlparse(value)
        if not parsed.netloc or "." not in parsed.netloc:
            raise serializers.ValidationError("Enter a valid organization website.")
        return value

    def validate_registration_document(self, value):
        if value is None:
            return value
        return validate_verification_document(value)

    def validate(self, attrs):
        if not domains_match(attrs["website"], attrs["official_email"]):
            raise serializers.ValidationError(
                {
                    "official_email": (
                        "Use an official email address on the same domain as the "
                        "organization website."
                    )
                }
            )
        if attrs.get("org_type") == Organization.OrgType.UNIVERSITY and attrs.get(
            "is_government_funded"
        ):
            if not attrs.get("registration_number") and not attrs.get("registration_document"):
                raise serializers.ValidationError(
                    {
                        "registration_number": (
                            "Public universities must provide a government registration "
                            "number or upload the registration document."
                        )
                    }
                )
            if not attrs.get("head_of_institution"):
                raise serializers.ValidationError(
                    {
                        "head_of_institution": (
                            "Add the Vice-Chancellor or Dean responsible for this institution."
                        )
                    }
                )
        return attrs


class JoinRequestCreateSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class JoinRequestDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class OrganizationJoinRequestSerializer(serializers.ModelSerializer):
    organization = OrganizationSearchSerializer(read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    reviewed_by = serializers.CharField(source="reviewed_by.username", read_only=True, default=None)

    class Meta:
        model = OrganizationJoinRequest
        fields = [
            "id", "organization", "username", "email", "message", "status",
            "reviewed_by", "reviewed_at", "decision_note", "created_at", "updated_at",
        ]


class OrganizationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["name", "domain", "org_type"]

    def validate_domain(self, value):
        value = (value or "").strip().lower().lstrip("@")
        if not value:
            return None
        if "." not in value:
            raise serializers.ValidationError("Enter a valid email domain, e.g. school.edu.")
        if Organization.objects.filter(domain=value).exists():
            raise serializers.ValidationError("That domain is already registered.")
        return value


class OrganizationUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["name", "domain", "logo", "auto_join_domain", "allow_join_requests", "org_type"]

    def validate_domain(self, value):
        value = (value or "").strip().lower().lstrip("@") or None
        if value and "." not in value:
            raise serializers.ValidationError("Enter a valid email domain, e.g. school.edu.")
        if value and Organization.objects.filter(domain=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("That domain is already registered.")
        return value


class MemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    subject_expertise = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationMembership
        fields = [
            "id", "username", "email", "avatar", "subject_expertise",
            "role", "status", "title", "department", "student_id", "joined_at",
        ]
        read_only_fields = ["username", "joined_at"]

    def get_email(self, obj):
        return obj.user.email if self.context.get("can_manage") else ""

    def get_avatar(self, obj):
        return _avatar(obj.user)

    def get_subject_expertise(self, obj):
        return _expertise(obj.user)


class InvitationSerializer(serializers.ModelSerializer):
    invited_by = serializers.CharField(source="invited_by.username", read_only=True, default=None)
    is_pending = serializers.BooleanField(read_only=True)
    accept_token = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationInvitation
        fields = [
            "id", "email", "role", "accept_token", "invited_by",
            "is_pending", "expires_at", "accepted_at", "created_at",
        ]

    def get_accept_token(self, obj):
        return str(obj.token) if self.context.get("can_manage") else None


class InviteRequestSerializer(serializers.Serializer):
    emails = serializers.ListField(
        child=serializers.EmailField(), allow_empty=False, max_length=500
    )
    role = serializers.ChoiceField(
        choices=[
            OrganizationMembership.Role.ADMIN,
            OrganizationMembership.Role.MODERATOR,
            OrganizationMembership.Role.TEACHER,
            OrganizationMembership.Role.STUDENT,
            OrganizationMembership.Role.MEMBER,
        ],
        default=OrganizationMembership.Role.STUDENT,
    )
    expires_days = serializers.IntegerField(min_value=1, max_value=90, default=14)


class MemberUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=OrganizationMembership.Role.choices, required=False)
    status = serializers.ChoiceField(
        choices=[
            OrganizationMembership.Status.ACTIVE,
            OrganizationMembership.Status.SUSPENDED,
        ],
        required=False,
    )
    title = serializers.CharField(max_length=120, allow_blank=True, required=False)
    department = serializers.CharField(max_length=120, allow_blank=True, required=False)
    student_id = serializers.CharField(max_length=64, allow_blank=True, required=False)


class MyInvitationSerializer(serializers.ModelSerializer):
    organization = OrganizationSerializer(read_only=True)
    token = serializers.UUIDField(read_only=True)

    class Meta:
        model = OrganizationInvitation
        fields = ["id", "organization", "email", "role", "token", "expires_at", "created_at"]


def invite_expiry(days):
    return timezone.now() + timezone.timedelta(days=days)
