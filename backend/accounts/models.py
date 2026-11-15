from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.validators import RegexValidator
from django.db import models

from souqna_api.wilayas import Wilaya

algerian_mobile = RegexValidator(
    regex=r'^0[567]\d{8}$',
    message='Enter an Algerian mobile number: 10 digits starting with 05, 06 or 07.',
)


class UserManager(BaseUserManager):
    """Creates users identified by phone number instead of username."""

    use_in_migrations = True

    def _create_user(self, phone, password, **extra_fields):
        if not phone:
            raise ValueError('A phone number is required.')
        email = extra_fields.pop('email', '')
        user = self.model(phone=phone, email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, phone, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(phone, password, **extra_fields)

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields['is_staff'] = True
        extra_fields['is_superuser'] = True
        return self._create_user(phone, password, **extra_fields)


class User(AbstractUser):
    """A Souqna user. Logs in with their phone number."""

    class Language(models.TextChoices):
        ARABIC = 'ar', 'العربية'
        FRENCH = 'fr', 'Français'
        ENGLISH = 'en', 'English'

    # Remove Django's default username/first/last name; we use phone + display_name.
    username = None
    first_name = None
    last_name = None

    phone = models.CharField(max_length=10, unique=True, validators=[algerian_mobile])
    email = models.EmailField(blank=True)
    display_name = models.CharField(max_length=50)
    wilaya = models.PositiveSmallIntegerField(choices=Wilaya.choices, null=True, blank=True)
    preferred_language = models.CharField(
        max_length=2, choices=Language.choices, default=Language.ARABIC
    )

    USERNAME_FIELD = 'phone'
    REQUIRED_FIELDS = ['display_name']

    objects = UserManager()

    def __str__(self):
        return f'{self.display_name} ({self.phone})'

    def get_full_name(self):
        return self.display_name

    def get_short_name(self):
        return self.display_name
