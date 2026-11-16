"""Daily limits: invisible for honest users, stop a scammer from posting in bulk.

"Per day" means the last 24 hours (so the limit can't be gamed at midnight).
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework import status

from souqna_api.exceptions import DetailedAPIException

NEW_ACCOUNT_DAYS = 14
LIMITS = {
    #             new account, older account
    'listings': (10, 50),
    'conversations': (20, 100),
}


class DailyLimitReached(DetailedAPIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = 'daily_limit'


def daily_limit(user, kind: str) -> int:
    new_account = user.date_joined > timezone.now() - timedelta(days=NEW_ACCOUNT_DAYS)
    new_limit, normal_limit = LIMITS[kind]
    return new_limit if new_account else normal_limit


def check_daily_limit(user, kind: str) -> None:
    """Raise DailyLimitReached if the user already created too many today."""
    since = timezone.now() - timedelta(hours=24)
    if kind == 'listings':
        used = user.listings.filter(created_at__gte=since).count()
        noun = 'listings'
    else:
        used = user.conversations_as_buyer.filter(created_at__gte=since).count()
        noun = 'conversations'
    limit = daily_limit(user, kind)
    if used >= limit:
        raise DailyLimitReached({
            'detail': f"You've reached today's limit of {limit} new {noun}. "
                      'Please try again tomorrow.',
            'code': 'daily_limit',
            'kind': kind,
            'limit': limit,
        })
