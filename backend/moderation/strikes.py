"""Strikes: each offensive message counts as one, unless an admin dismisses it.

- 3 strikes in 30 days: no messages or voice messages for 7 days.
- More after that (4+): the account is suspended until an admin reviews it.
- Any strike in the last 30 days: no voice messages.
Never banned automatically: banning is always a human decision.
"""

from datetime import timedelta

from django.utils import timezone

from .models import ContentFlag, ModerationLog

WINDOW_DAYS = 30
BLOCK_MESSAGES_AFTER = 3
BLOCK_MESSAGES_DAYS = 7
SUSPEND_AFTER = 4


def strike_count(user) -> int:
    since = timezone.now() - timedelta(days=WINDOW_DAYS)
    return (ContentFlag.objects
            .filter(user=user, strike=True, created_at__gte=since)
            .exclude(status=ContentFlag.Status.DISMISSED)
            .count())


def has_recent_strike(user) -> bool:
    return strike_count(user) > 0


def messaging_blocked_until(user):
    """The date until which this user can't send messages, or None."""
    until = user.messaging_blocked_until
    return until if until and until > timezone.now() else None


def apply_sanctions(user) -> None:
    """After a new strike: block messages at 3, suspend at 4 (never ban)."""
    from . import actions  # avoid a circular import

    count = strike_count(user)
    if count >= BLOCK_MESSAGES_AFTER and not messaging_blocked_until(user):
        user.messaging_blocked_until = timezone.now() + timedelta(days=BLOCK_MESSAGES_DAYS)
        user.save(update_fields=['messaging_blocked_until'])
        actions.log(None, ModerationLog.Action.AUTO_BLOCK_MESSAGES, user,
                    f'{count} strikes in {WINDOW_DAYS} days: no messages for '
                    f'{BLOCK_MESSAGES_DAYS} days')
    if count >= SUSPEND_AFTER and user.is_active:
        user.is_active = False
        user.save(update_fields=['is_active'])
        actions.log(None, ModerationLog.Action.AUTO_SUSPEND, user,
                    f'{count} strikes in {WINDOW_DAYS} days: suspended until reviewed')


def after_strike_removed(user) -> None:
    """A flag was dismissed as a mistake: lift the message block if under 3 again.
    (A suspension stays until an admin reactivates the account.)"""
    if user and messaging_blocked_until(user) and strike_count(user) < BLOCK_MESSAGES_AFTER:
        user.messaging_blocked_until = None
        user.save(update_fields=['messaging_blocked_until'])
