"""Phone verification with a 6-digit SMS code.

Rules:
- a code works for 5 minutes;
- a new code can be asked for 60 seconds after the previous one;
- after 5 wrong codes, the user must wait 15 minutes (asking for new codes
  doesn't reset this count).
"""

import math
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from moderation.devices import is_phone_blocked

from .models import PHONE_ERROR, PhoneVerification, User, algerian_mobile, normalize_phone
from .sms import send_sms

CODE_LIFETIME = timedelta(minutes=5)
RESEND_AFTER = timedelta(seconds=60)
MAX_WRONG_ATTEMPTS = 5
LOCK_TIME = timedelta(minutes=15)

SMS_TEXT = {
    'fr': 'Sougna : votre code de vérification est {code}. Il expire dans 5 minutes.',
    'ar': 'سوقنا: رمز التحقق الخاص بك هو {code}. ينتهي خلال 5 دقائق.',
    'en': 'Sougna: your verification code is {code}. It expires in 5 minutes.',
}


class VerificationError(Exception):
    """A refusal with a short code word the app can recognise, e.g. "wrong_code"."""

    def __init__(self, code, message, status=400, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.extra = extra

    def as_data(self):
        return {'detail': self.message, 'code': self.code, **self.extra}


def _seconds_until(moment, now):
    return max(0, math.ceil((moment - now).total_seconds()))


def _locked_error(seconds):
    minutes = max(1, math.ceil(seconds / 60))
    return VerificationError(
        'locked', f'Too many wrong codes. Try again in {minutes} minutes.', status=429,
        retry_in=seconds,
    )


def status_for(user, now=None):
    """What the verification screen needs to know."""
    now = now or timezone.now()
    pending = PhoneVerification.objects.filter(user=user).first()
    data = {
        'phone_verified': user.phone_verified,
        'phone': pending.phone if pending else user.phone,
        'code_expires_in': 0,
        'resend_in': 0,
        'locked_for': 0,
    }
    if pending:
        data['code_expires_in'] = _seconds_until(pending.expires_at, now)
        data['resend_in'] = _seconds_until(pending.sent_at + RESEND_AFTER, now)
        if pending.locked_until:
            data['locked_for'] = _seconds_until(pending.locked_until, now)
    return data


def send_code(user, phone=None, now=None):
    """Send a new code by SMS. `phone` is needed only if the account has no phone yet
    (or to correct a mistyped number before it is verified)."""
    now = now or timezone.now()
    if user.phone_verified:
        raise VerificationError('already_verified', 'Your phone number is already verified.')

    target = normalize_phone(phone) if phone else user.phone
    if not target:
        raise VerificationError('phone_required', 'Enter your phone number.')
    try:
        algerian_mobile(target)
    except Exception:
        raise VerificationError('phone_invalid', PHONE_ERROR)
    if User.objects.filter(phone=target).exclude(pk=user.pk).exists():
        raise VerificationError('phone_taken', 'This phone number is already registered.')
    if is_phone_blocked(target):
        raise VerificationError('phone_blocked', "This phone number can't be used.")

    with transaction.atomic():
        pending = PhoneVerification.objects.select_for_update().filter(user=user).first()
        if pending:
            if pending.locked_until and pending.locked_until > now:
                raise _locked_error(_seconds_until(pending.locked_until, now))
            if pending.locked_until:  # the 15 minutes are over: start again
                pending.locked_until = None
                pending.failed_attempts = 0
            if pending.sent_at + RESEND_AFTER > now:
                wait = _seconds_until(pending.sent_at + RESEND_AFTER, now)
                raise VerificationError(
                    'resend_too_soon', f'Wait {wait} seconds before asking for a new code.',
                    status=429, retry_in=wait,
                )
        else:
            pending = PhoneVerification(user=user)

        code = f'{secrets.randbelow(10**6):06d}'
        pending.phone = target
        pending.code_hash = PhoneVerification.hash_code(user.pk, code)
        pending.sent_at = now
        pending.expires_at = now + CODE_LIFETIME
        pending.save()

    text = SMS_TEXT.get(user.preferred_language, SMS_TEXT['fr']).format(code=code)
    send_sms(target, text)
    return status_for(user, now)


def verify_code(user, code, now=None):
    """Check the code. On success the phone is marked as verified."""
    now = now or timezone.now()
    if user.phone_verified:
        raise VerificationError('already_verified', 'Your phone number is already verified.')
    code = (code or '').strip()
    if len(code) != 6 or not code.isdigit():
        raise VerificationError('invalid_code', 'Enter the 6-digit code.')

    # Errors are raised only AFTER the database block: raising inside it would undo
    # the saved wrong-attempt count, and the 5-attempt limit would never trigger.
    error = None
    with transaction.atomic():
        pending = PhoneVerification.objects.select_for_update().filter(user=user).first()
        if not pending:
            error = VerificationError('no_code', 'Ask for a code first.')
        elif pending.locked_until and pending.locked_until > now:
            error = _locked_error(_seconds_until(pending.locked_until, now))
        elif pending.expires_at <= now:
            error = VerificationError('code_expired', 'This code has expired. Ask for a new one.')
        elif not pending.code_matches(code):
            pending.failed_attempts += 1
            if pending.failed_attempts >= MAX_WRONG_ATTEMPTS:
                pending.locked_until = now + LOCK_TIME
                error = _locked_error(int(LOCK_TIME.total_seconds()))
            else:
                left = MAX_WRONG_ATTEMPTS - pending.failed_attempts
                error = VerificationError('wrong_code', f'Wrong code. {left} attempts left.',
                                          attempts_left=left)
            pending.save()
        elif (pending.phone != user.phone
              and User.objects.filter(phone=pending.phone).exclude(pk=user.pk).exists()):
            error = VerificationError('phone_taken', 'This phone number is already registered.')
        else:
            # Right code.
            user.phone = pending.phone
            user.phone_verified = True
            user.phone_verified_at = now
            user.save()
            pending.delete()
    if error:
        raise error
    return user
