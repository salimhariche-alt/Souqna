"""Sending SMS messages.

Which sender is used is chosen by ONE setting, SMS_BACKEND (DJANGO_SMS_BACKEND in .env).
To plug in a real SMS provider later:
  1. write a class with a `send(phone, message)` method (subclass BaseSMSBackend),
     e.g. accounts.sms_providers.MyProviderSMSBackend, calling the provider's API;
  2. set DJANGO_SMS_BACKEND=accounts.sms_providers.MyProviderSMSBackend in .env.
Nothing else in the code needs to change.
"""

import logging

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger(__name__)


class BaseSMSBackend:
    def send(self, phone: str, message: str) -> None:
        raise NotImplementedError


class ConsoleSMSBackend(BaseSMSBackend):
    """Development: print the SMS in the Django server terminal instead of sending it."""

    def send(self, phone, message):
        line = '=' * 60
        print(f'\n{line}\n  SMS (development - not really sent)\n  To:  {phone}\n'
              f'  {message}\n{line}\n', flush=True)


class MemorySMSBackend(BaseSMSBackend):
    """Automatic tests: keep the messages in a list (MemorySMSBackend.outbox)."""

    outbox: list[tuple[str, str]] = []

    def send(self, phone, message):
        MemorySMSBackend.outbox.append((phone, message))


def send_sms(phone: str, message: str) -> None:
    backend = import_string(settings.SMS_BACKEND)()
    backend.send(phone, message)
    logger.info('SMS sent to %s with %s', phone, settings.SMS_BACKEND)
