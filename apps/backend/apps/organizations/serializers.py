from django.utils import timezone
from rest_framework import serializers

from .models import Organization, OrganizationInvitation, OrganizationMembership


def _avatar(user):
    profile = getattr(user, "profile", None)
    return profile.avatar if profile else ""


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
            "plan_tier", "subscription_status", "seat_limit", "seats_used",
            "seats_remaining", "auto_join_domain", "member_count",
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


class OrganizationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["name", "domain"]

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
        fields = ["name", "domain", "logo", "auto_join_domain"]

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
