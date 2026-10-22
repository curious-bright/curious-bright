from rest_framework.permissions import SAFE_METHODS, BasePermission


def _is_org_admin(user, obj):
    org = getattr(obj, "organization", None)
    if not org or not user.is_authenticated:
        return False
    from apps.organizations.models import OrganizationMembership
    return org.memberships.filter(
        user=user,
        role__in=[OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN],
        status=OrganizationMembership.Status.ACTIVE,
    ).exists()


def is_moderator_or_staff(user):
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser or getattr(user, "is_moderator", False)))


class IsOwnerOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        if is_moderator_or_staff(request.user):
            return True
        if _is_org_admin(request.user, obj):
            return True
        owner = getattr(obj, "author", None) or getattr(obj, "owner", None) or getattr(obj, "user", None) or getattr(obj, "created_by", None)
        return owner == request.user


class IsOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_moderator_or_staff(request.user):
            return True
        if _is_org_admin(request.user, obj):
            return True
        owner = getattr(obj, "author", None) or getattr(obj, "owner", None) or getattr(obj, "user", None) or getattr(obj, "created_by", None)
        return owner == request.user


class IsCreatorOrAdminOnly(BasePermission):
    """Enforces edit/delete permissions strictly according to requirement 7:
    Only creator, plus org admins for org content and platform admins for moderation.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_moderator_or_staff(request.user):
            return True
        if _is_org_admin(request.user, obj):
            return True
        owner = getattr(obj, "author", None) or getattr(obj, "owner", None) or getattr(obj, "user", None) or getattr(obj, "created_by", None)
        return owner == request.user

