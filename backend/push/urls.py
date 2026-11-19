from django.urls import path

from .views import DevicesView, SettingsView

urlpatterns = [
    path('push/devices/', DevicesView.as_view(), name='push-devices'),
    path('push/settings/', SettingsView.as_view(), name='push-settings'),
]
