from rest_framework.permissions import BasePermission


class IsLawyer(BasePermission):
    """Allow access only to users designated as lawyers."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'profile') and # Check if profile exists
            request.user.profile.role == 'lawyer'
        )


class IsClient(BasePermission):
    """Allow access only to users designated as clients."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'profile') and # Check if profile exists
            request.user.profile.role == 'client'
        ) 