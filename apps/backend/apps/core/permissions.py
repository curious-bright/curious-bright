from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsOwnerOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        owner = getattr(obj, "author", None) or getattr(obj, "owner", None) or getattr(obj, "user", None)
        return owner == request.user


class IsOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        owner = getattr(obj, "author", None) or getattr(obj, "owner", None) or getattr(obj, "user", None)
        return owner == request.user
