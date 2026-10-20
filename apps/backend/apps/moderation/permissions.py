from rest_framework.permissions import BasePermission


class IsModerator(BasePermission):
    """Staff or a user granted the moderator role (via approved application)."""

    message = "Moderator access is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_moderator or user.is_staff))
