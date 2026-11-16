import hashlib
import hmac
import re
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from souqna_api.wilayas import Wilaya

PHONE_ERROR = 'Enter a valid Algerian mobile number: 10 digits starting with 05, 06 or 07.'

algerian_mobile = RegexValidator(regex=r'^0[567]\d{8}$', message=PHONE_ERROR)


def normalize_phone(value):
    """Tidy a phone number: '05 55-12.34.56' or '+213 555 12 34 56' -> '0555123456'."""
    value = re.sub(r'[\s\-.()]', '', value or '')
    if value.startswith('+213'):
        value = '0' + value[4:]
    elif value.startswith('00213'):
        value = '0' + value[5:]
    return value


def normalize_email_address(value):
    """Emails are stored lowercase so 'A@Mail.com' and 'a@mail.com' count as the same."""
    return (value or '').strip().lower()


def avatar_file_name(user, filename):
    """avatars/2026/11/<random>.jpg - a random name nobody can guess."""
    return f'avatars/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.jpg'


class UserManager(BaseUserManager):
    """Creates users identified by phone number and/or email."""

    use_in_migrations = True

    def _create_user(self, phone, password, **extra_fields):
        phone = normalize_phone(phone) or None
        email = normalize_email_address(extra_fields.pop('email', None)) or None
        if not phone and not email:
            raise ValueError('A phone number or an email is required.')
        user = self.model(phone=phone, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, phone=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(phone, password, **extra_fields)

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields['is_staff'] = True
        extra_fields['is_superuser'] = True
        return self._create_user(phone, password, **extra_fields)


class User(AbstractUser):
    """A Souqna user. Signs up and logs in with a phone number or an email (or both)."""

    class Language(models.TextChoices):
        ARABIC = 'ar', 'العربية'
        FRENCH = 'fr', 'Français'
        ENGLISH = 'en', 'English'

    # Remove Django's default username/first/last name; we use phone + display_name.
    username = None
    first_name = None
    last_name = None

    # Both optional, but every user needs at least one (see the constraint below).
    # Empty values are stored as NULL so many users can have "no email" / "no phone".
    phone = models.CharField(max_length=10, unique=True, null=True, blank=True,
                             validators=[algerian_mobile])
    email = models.EmailField(unique=True, null=True, blank=True)
    display_name = models.CharField(max_length=50)
    wilaya = models.PositiveSmallIntegerField(choices=Wilaya.choices, null=True, blank=True)
    preferred_language = models.CharField(
        max_length=2, choices=Language.choices, default=Language.ARABIC
    )
    # Trust: the phone number was confirmed with an SMS code.
    phone_verified = models.BooleanField(default=False)
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    # Moderation: "suspended" = is_active False (can be undone). "Banned" = suspended
    # + this date; the phone number and devices are also blocked from new accounts.
    banned_at = models.DateTimeField(null=True, blank=True)
    # Reported by 3 different verified users: their listings are hidden from
    # everyone else until an admin reviews the reports.
    hidden_by_reports = models.BooleanField(default=False)
    # 3 strikes (offensive messages) in 30 days: no messages or voice until this date.
    messaging_blocked_until = models.DateTimeField(null=True, blank=True)
    # Optional profile photo (cleaned and resized to 600 x 600 when uploaded).
    avatar = models.ImageField(upload_to=avatar_file_name, blank=True)
    # The user deleted their account: personal data erased, listings hidden. The row
    # stays so moderation evidence (flags, reports, log) still points somewhere.
    deleted_at = models.DateTimeField(null=True, blank=True)
    # When they saw the "Buy safely" tips (shown once, before their first conversation).
    safety_tips_seen_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = 'phone'
    REQUIRED_FIELDS = ['display_name']

    objects = UserManager()

    class Meta(AbstractUser.Meta):
        constraints = [
            models.CheckConstraint(
                condition=Q(phone__isnull=False) | Q(email__isnull=False),
                name='user_has_phone_or_email',
            ),
        ]

    def __str__(self):
        return f'{self.display_name} ({self.phone or self.email})'

    def clean(self):
        super().clean()
        self.phone = normalize_phone(self.phone) or None
        self.email = normalize_email_address(self.email) or None
        if not self.phone and not self.email:
            raise ValidationError('Enter a phone number or an email.')

    def save(self, *args, **kwargs):
        # Store empty values as NULL and keep the formats consistent.
        self.phone = normalize_phone(self.phone) or None
        self.email = normalize_email_address(self.email) or None
        super().save(*args, **kwargs)

    def get_full_name(self):
        return self.display_name

    def get_short_name(self):
        return self.display_name

    @property
    def items_sold(self) -> int:
        """How many of this user's listings are marked as sold.

        Counted from the listings (not stored separately), so it is always correct,
        even if a listing is set back to active.
        """
        return self.listings.filter(status='sold').count()


class PhoneVerification(models.Model):
    """The SMS code a user is waiting to type in (at most one per user).

    The code itself is never stored, only a scrambled version (HMAC with SECRET_KEY),
    so someone reading the database still can't see the codes.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='phone_verification'
    )
    # The number the code was sent to. Usually the user's phone; for an account
    # without a phone it becomes their phone once the code is confirmed.
    phone = models.CharField(max_length=10, validators=[algerian_mobile])
    code_hash = models.CharField(max_length=64)
    sent_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    # Wrong codes in a row. Not reset by sending a new code, so asking for new
    # codes can't be used to get around the limit.
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'Code for {self.user} ({self.phone})'

    @staticmethod
    def hash_code(user_id: int, code: str) -> str:
        message = f'{user_id}:{code}'.encode()
        return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()

    def code_matches(self, code: str) -> bool:
        return hmac.compare_digest(self.code_hash, self.hash_code(self.user_id, code))
