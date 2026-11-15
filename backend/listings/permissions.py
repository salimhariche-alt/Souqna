from rest_framework import permissions


class IsSellerOrReadOnly(permissions.BasePermission):
    """Anyone can read a listing; only its seller can change it."""

    message = 'Only the seller of this listing can do that.'

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.seller_id == request.user.id
