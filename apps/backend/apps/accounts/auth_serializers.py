from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .services import AuthFlowError


class UsernameOrEmailTokenSerializer(TokenObtainPairSerializer):
    """Login accepts either a username or an email address."""

    def validate(self, attrs):
        identifier = attrs.get(self.username_field) or ""
        password = attrs.get("password") or ""
        User = get_user_model()

        user = None
        if identifier and "@" in identifier:
            user = User.objects.filter(email__iexact=identifier).first()
            if user:
                attrs[self.username_field] = user.username
        elif identifier:
            user = User.objects.filter(username=identifier).first()

        # Only reveal the unverified state after the password has been checked;
        # wrong credentials still get the normal generic 401.
        if (
            user is not None
            and user.is_active
            and user.check_password(password)
            and not user.is_email_verified
        ):
            raise AuthFlowError(
                "Please verify your email address before signing in. "
                "You can request a new code on the verification screen.",
                code="email_unverified",
                status_code=403,
            )

        return super().validate(attrs)
