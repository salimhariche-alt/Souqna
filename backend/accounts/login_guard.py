"""Stop password guessing on one account: after 5 wrong passwords within 15 minutes,
that account can't be logged into for 15 minutes (even with the right password).

This is on top of the "10 log-in attempts per minute per connection" limit, which
stops one computer trying many accounts. The counts live in Django's cache, so they
disappear by themselves after 15 minutes.
"""

import math
import time

from django.core.cache import cache

from .models import normalize_email_address, normalize_phone

MAX_WRONG_PASSWORDS = 5
WINDOW_SECONDS = 15 * 60
LOCK_SECONDS = 15 * 60


def _account_key(identifier: str) -> str:
    identifier = (identifier or '').strip()
    simple = normalize_email_address(identifier) if '@' in identifier else normalize_phone(identifier)
    return f'login-guard:{simple}'


def seconds_locked(identifier: str) -> int:
    until = cache.get(_account_key(identifier) + ':locked-until')
    return max(0, math.ceil(until - time.time())) if until else 0


def record_wrong_password(identifier: str) -> None:
    key = _account_key(identifier)
    count = (cache.get(key + ':count') or 0) + 1
    if count >= MAX_WRONG_PASSWORDS:
        cache.set(key + ':locked-until', time.time() + LOCK_SECONDS, LOCK_SECONDS)
        cache.delete(key + ':count')
    else:
        cache.set(key + ':count', count, WINDOW_SECONDS)


def reset(identifier: str) -> None:
    key = _account_key(identifier)
    cache.delete_many([key + ':count', key + ':locked-until'])
