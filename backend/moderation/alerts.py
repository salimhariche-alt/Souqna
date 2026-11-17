"""Alerts to the admin for URGENT content (threats, terrorism/extremism).

Like SMS, the way alerts are sent is chosen with one setting:
    MODERATION_ALERT_BACKEND = 'moderation.alerts.ConsoleAlertBackend'  (development: printed)
    MODERATION_ALERT_BACKEND = 'moderation.alerts.EmailAlertBackend'    (later: by email to
                                                                         MODERATION_ALERT_EMAILS)
"""

from django.conf import settings
from django.core.mail import send_mail
from django.utils.module_loading import import_string


class BaseAlertBackend:
    def send(self, subject: str, body: str) -> None:
        raise NotImplementedError


class ConsoleAlertBackend(BaseAlertBackend):
    def send(self, subject, body):
        line = '!' * 64
        print(f'\n{line}\n  URGENT MODERATION ALERT (development - printed, not emailed)\n'
              f'  {subject}\n\n{body}\n{line}\n', flush=True)


class EmailAlertBackend(BaseAlertBackend):
    def send(self, subject, body):
        recipients = getattr(settings, 'MODERATION_ALERT_EMAILS', [])
        if recipients:
            send_mail(f'[Sougna URGENT] {subject}', body, None, recipients, fail_silently=True)


class MemoryAlertBackend(BaseAlertBackend):
    """For tests: alerts are kept in a list."""

    outbox: list[tuple[str, str]] = []

    def send(self, subject, body):
        MemoryAlertBackend.outbox.append((subject, body))


def send_alert(flag) -> None:
    backend = import_string(getattr(settings, 'MODERATION_ALERT_BACKEND',
                                    'moderation.alerts.ConsoleAlertBackend'))()
    subject = f'{flag.get_category_display()} from {flag.user_label}'
    body = (f'Flag #{flag.pk} ({flag.get_source_display()})\n'
            f'User: {flag.user_label} {flag.user_phone}\n'
            f'Matched: {", ".join(flag.matched)}\n'
            f'Text: {flag.content}\n\n'
            f'Review it in the admin: /admin/moderation/contentflag/{flag.pk}/change/')
    backend.send(subject, body)
