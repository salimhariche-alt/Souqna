from django.contrib.auth.models import update_last_login
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenRefreshView

from . import phone_verification
from .serializers import LoginSerializer, ProfileSerializer, SignupSerializer


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
