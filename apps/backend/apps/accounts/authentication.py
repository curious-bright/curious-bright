from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

from .activity import record_user_activity


class ActivityJWTAuthentication(JWTAuthentication):
    """JWT authentication that records a privacy-safe daily activity row."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, _token = result
            record_user_activity(user)
        return result


class ActivitySessionAuthentication(SessionAuthentication):
    """Session authentication variant for browser/admin API requests."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, _auth = result
            record_user_activity(user)
        return result
