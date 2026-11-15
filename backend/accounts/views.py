from django.contrib.auth.models import update_last_login
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenRefreshView

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


class MeView(generics.RetrieveUpdateAPIView):
    """GET / PATCH /api/auth/me/ - see or edit my display name, wilaya and language."""

    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
