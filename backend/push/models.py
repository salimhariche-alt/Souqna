"""Push notifications on the phone (Step 5.1 I).

- PushDevice: one phone's Expo push address ("ExponentPushToken[...]"), saved when the
  person allows notifications; forgotten on log out or when Expo says it's gone.
- PushSettings: what the person wants on their phone (orders, messages).
"""

from django.conf import settings
from django.db import models


class PushDevice(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='push_devices')
    token = models.CharField(max_length=200, unique=True)
    platform = models.CharField(max_length=10, blank=True)  # "android" / "ios"
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_seen']

    def __str__(self):
        return f'{self.user} - {self.platform or "phone"} ({self.token[:28]}...)'


class PushSettings(models.Model):
    """Profile -> Notifications. Both on by default (the phone still asks permission)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='push_settings')
    orders = models.BooleanField('orders and deliveries', default=True)
    messages = models.BooleanField('messages and offers', default=True)

    def __str__(self):
        return f'{self.user}: orders {self.orders}, messages {self.messages}'

    @classmethod
    def for_user(cls, user):
        return cls.objects.get_or_create(user=user)[0]
