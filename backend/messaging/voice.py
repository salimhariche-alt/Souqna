"""Guardrails for voice messages, so they can't easily be used to move a deal outside
the app (e.g. "call me on 0555..." said out loud, which text checks can't see).

- only users with a verified phone can send them (see the view's permissions);
- max 10 per person per conversation per day (3 for accounts younger than 14 days).
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework import status

from moderation.limits import NEW_ACCOUNT_DAYS
from souqna_api.exceptions import DetailedAPIException

#               new account, older account
VOICE_LIMITS = (3, 10)


class VoiceDailyLimit(DetailedAPIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


def voice_limit(user) -> int:
    new_account = user.date_joined > timezone.now() - timedelta(days=NEW_ACCOUNT_DAYS)
    return VOICE_LIMITS[0] if new_account else VOICE_LIMITS[1]


def voice_sent_today(conversation, user) -> int:
    since = timezone.now() - timedelta(hours=24)
    return (conversation.messages.filter(sender=user, sent_at__gte=since)
            .exclude(audio='').count())


def voice_status(conversation, user) -> dict:
    """What the app needs to show the microphone button."""
    limit = voice_limit(user)
    return {
        'limit': limit,
        'left_today': max(0, limit - voice_sent_today(conversation, user)),
    }


def check_can_send_voice(conversation, user) -> None:
    limit = voice_limit(user)
    if voice_sent_today(conversation, user) >= limit:
        raise VoiceDailyLimit({
            'detail': f"You've reached today's limit of {limit} voice messages in this "
                      'conversation.',
            'code': 'voice_daily_limit',
            'limit': limit,
        })
