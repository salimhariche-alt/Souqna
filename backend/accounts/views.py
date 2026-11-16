from django.contrib.auth.models import update_last_login
from django.utils import timezone
from PIL import UnidentifiedImageError
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenRefreshView

from listings.serializers import MAX_PHOTO_BYTES
from moderation.images import make_avatar
from moderation.models import Block

from . import phone_verification
from .deletion import delete_account
from .models import User, normalize_email_address, normalize_phone
from .serializers import (
    LoginSerializer,
    ProfileSerializer,
    PublicProfileSerializer,
    SignupSerializer,
)


class LimitAttemptsMixin:
    """Allow 10 sign-up/log-in attempts per minute (see DEFAULT_THROTTLE_RATES).

    Only real attempts (POST) count; just opening the page in a browser doesn't.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def get_throttles(self):
        if self.request.method != 'POST':
            return []
        return super().get_throttles()


class SignupView(LimitAttemptsMixin, generics.CreateAPIView):
    """POST /api/auth/signup/ - create an account. Returns the profile and tokens."""

    serializer_class = SignupSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # signing up never needs an existing login


class LoginView(LimitAttemptsMixin, generics.GenericAPIView):
    """POST /api/auth/login/ - phone or email + password. Returns the profile and tokens."""

    serializer_class = LoginSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get_authenticate_header(self, request):
        # Makes a wrong login answer 401 ("not logged in") rather than 403.
        return 'Bearer realm="api"'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_last_login(None, serializer.validated_data['user'])
        return Response(serializer.data, status=status.HTTP_200_OK)


class RefreshView(TokenRefreshView):
    """POST /api/auth/refresh/ - send {"refresh": "..."}; get a new access token."""

    authentication_classes = []


class PhoneStatusView(APIView):
    """GET /api/auth/phone/status/ - verified? seconds until the code expires / resend."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(phone_verification.status_for(request.user))


class SendPhoneCodeView(APIView):
    """POST /api/auth/phone/send-code/ - send a 6-digit code by SMS.

    Body: {} to use the account's phone, or {"phone": "06..."} if it has none.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'sms'  # at most 10 SMS per hour per user (SMS cost money)

    def post(self, request):
        try:
            data = phone_verification.send_code(request.user, request.data.get('phone'))
        except phone_verification.VerificationError as error:
            return Response(error.as_data(), status=error.status)
        return Response(data)


class VerifyPhoneCodeView(APIView):
    """POST /api/auth/phone/verify/ - {"code": "123456"}. Returns my updated profile."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            user = phone_verification.verify_code(request.user, request.data.get('code'))
        except phone_verification.VerificationError as error:
            return Response(error.as_data(), status=error.status)
        return Response({'user': ProfileSerializer(user).data})


class SafetyTipsSeenView(APIView):
    """POST /api/auth/safety-tips/seen/ - I've read the "Buy safely" tips; don't show
    them again (on any phone). Returns my updated profile."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.safety_tips_seen_at is None:
            user.safety_tips_seen_at = timezone.now()
            user.save(update_fields=['safety_tips_seen_at'])
        return Response({'user': ProfileSerializer(user).data})


class MeView(generics.RetrieveUpdateAPIView):
    """GET / PATCH /api/auth/me/ - see or edit my display name, wilaya and language."""

    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class AvatarView(APIView):
    """POST /api/auth/me/avatar/ (form field "image") - set my profile photo.
    DELETE /api/auth/me/avatar/ - remove it.

    The photo is always saved again by the server: upright, max 600 x 600, JPEG, and
    without hidden data (GPS location, phone model...)."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get('image')
        if uploaded is None:
            return Response({'image': ['Choose a photo.']}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded.size > MAX_PHOTO_BYTES:
            return Response({'image': ['Photos must be 10 MB or smaller.']},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            clean = make_avatar(uploaded)
        except (UnidentifiedImageError, OSError, ValueError):
            return Response({'image': ['This file is not a photo.']},
                            status=status.HTTP_400_BAD_REQUEST)
        user = request.user
        old = user.avatar.name if user.avatar else None
        user.avatar.save('avatar.jpg', clean, save=True)
        if old:
            user.avatar.storage.delete(old)
        return Response({'user': ProfileSerializer(user, context={'request': request}).data})

    def delete(self, request):
        user = request.user
        if user.avatar:
            user.avatar.delete(save=True)
        return Response({'user': ProfileSerializer(user, context={'request': request}).data})


class DeleteAccountView(APIView):
    """POST /api/auth/delete-account/ - {"confirm": "<my phone number>"} (or my email if
    the account has no phone). Erases my personal data and hides my listings."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        typed = str(request.data.get('confirm', '')).strip()
        expected_ok = (normalize_phone(typed) == user.phone) if user.phone else (
            normalize_email_address(typed) == user.email)
        if not typed or not expected_ok:
            return Response({'detail': 'Type your phone number to confirm.',
                             'code': 'confirm_mismatch'}, status=status.HTTP_400_BAD_REQUEST)
        delete_account(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


def visible_users(viewer):
    """Accounts anyone may see: active, not deleted or hidden, and no block either way."""
    users = User.objects.filter(is_active=True, deleted_at__isnull=True, hidden_by_reports=False)
    if viewer.is_authenticated:
        users = users.exclude(pk__in=Block.objects.filter(blocker=viewer).values('blocked'))
        users = users.exclude(pk__in=Block.objects.filter(blocked=viewer).values('blocker'))
    return users


class MemberSearchView(generics.ListAPIView):
    """GET /api/users/?search=amina - members whose display name contains the words
    (at least 2 letters, at most 10 results). Never phone numbers or emails."""

    serializer_class = PublicProfileSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None
    MAX_RESULTS = 10

    def get_queryset(self):
        query = self.request.query_params.get('search', '').strip()
        if len(query) < 2:
            return User.objects.none()
        return (visible_users(self.request.user)
                .filter(display_name__icontains=query)
                .exclude(is_staff=True)
                .order_by('-phone_verified', 'display_name')[:self.MAX_RESULTS])


class PublicProfileView(generics.RetrieveAPIView):
    """GET /api/users/{id}/ - a seller's public profile (never their phone or email).

    "Not found" for suspended, banned, deleted or hidden accounts, and when one of you
    blocked the other. Their listings: /api/listings/?seller={id}
    """

    serializer_class = PublicProfileSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return visible_users(self.request.user)
