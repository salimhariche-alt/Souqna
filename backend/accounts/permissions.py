from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied


class IsPhoneVerified(permissions.BasePermission):
    """Only users who confirmed their phone with an SMS code may do this.

    The answer includes "code": "phone_not_verified", so the app knows to open
    the verification screen instead of showing a generic error.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False  # "please log in" (401) is handled by IsAuthenticated
        if not user.phone_verified:
            raise PermissionDenied({
                'detail': 'Verify your phone number first.',
                'code': 'phone_not_verified',
            })
        return True
