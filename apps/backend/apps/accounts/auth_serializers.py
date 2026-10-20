from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class UsernameOrEmailTokenSerializer(TokenObtainPairSerializer):
    """Login accepts either a username or an email address."""

    def validate(self, attrs):
        identifier = attrs.get(self.username_field) or ""
        if identifier and "@" in identifier:
            user = get_user_model().objects.filter(email__iexact=identifier).first()
            if user:
                attrs[self.username_field] = user.username
        return super().validate(attrs)
