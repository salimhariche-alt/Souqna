from django.urls import path

from .views import (
    LoginView,
    MeView,
    PhoneStatusView,
    RefreshView,
    SafetyTipsSeenView,
    SendPhoneCodeView,
    SignupView,
    VerifyPhoneCodeView,
)

urlpatterns = [
    path('signup/', SignupView.as_view(), name='auth-signup'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('refresh/', RefreshView.as_view(), name='auth-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('phone/status/', PhoneStatusView.as_view(), name='auth-phone-status'),
    path('phone/send-code/', SendPhoneCodeView.as_view(), name='auth-phone-send'),
    path('phone/verify/', VerifyPhoneCodeView.as_view(), name='auth-phone-verify'),
    path('safety-tips/seen/', SafetyTipsSeenView.as_view(), name='auth-safety-tips-seen'),
]
