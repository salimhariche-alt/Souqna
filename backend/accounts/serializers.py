from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken

from souqna_api.wilayas import Wilaya

from .models import PHONE_ERROR, User, algerian_mobile, normalize_email_address, normalize_phone


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


class ProfileSerializer(serializers.ModelSerializer):
    """My profile. Phone and email are shown but can't be changed here."""

    wilaya_name = serializers.CharField(source='get_wilaya_display', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'phone', 'email', 'display_name', 'wilaya', 'wilaya_name',
                  'preferred_language', 'date_joined']
        read_only_fields = ['id', 'phone', 'email', 'date_joined']
        extra_kwargs = {
            'display_name': {'error_messages': {'blank': 'Please enter your name.'}},
            'preferred_language': {'error_messages': {
                'invalid_choice': 'Language must be "ar", "fr" or "en".'}},
        }


class SignupSerializer(serializers.Serializer):
    phone = serializers.CharField(required=False, allow_blank=True, max_length=20,
                                  help_text='Algerian mobile, e.g. 0555123456')
    email = serializers.EmailField(required=False, allow_blank=True,
                                   error_messages={'invalid': 'Enter a valid email address.'})
    password = serializers.CharField(write_only=True, style={'input_type': 'password'},
                                     help_text='At least 8 characters.')
    display_name = serializers.CharField(max_length=50, error_messages={
        'required': 'Please enter your name.', 'blank': 'Please enter your name.'})
    wilaya = serializers.ChoiceField(choices=Wilaya.choices, error_messages={
        'required': 'Please choose your wilaya.',
        'invalid_choice': 'Choose a wilaya number from 1 to 58.'})
    preferred_language = serializers.ChoiceField(
        choices=User.Language.choices, default=User.Language.ARABIC,
        error_messages={'invalid_choice': 'Language must be "ar", "fr" or "en".'})

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if not phone:
            return ''
        try:
            algerian_mobile(phone)
        except DjangoValidationError:
            raise serializers.ValidationError(PHONE_ERROR)
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError('This phone number is already registered.')
        return phone

    def validate_email(self, value):
        email = normalize_email_address(value)
        if email and User.objects.filter(email=email).exists():
            raise serializers.ValidationError('This email is already registered.')
        return email

    def validate(self, data):
        if not data.get('phone') and not data.get('email'):
            raise serializers.ValidationError(
                {'phone': 'Enter a phone number or an email.',
                 'email': 'Enter a phone number or an email.'})
        # Django's password rules: at least 8 characters, not too common,
        # not only numbers, not too similar to your name/phone/email.
        candidate = User(phone=data.get('phone') or None, email=data.get('email') or None,
                         display_name=data['display_name'])
        try:
            validate_password(data['password'], user=candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)})
        return data

    def create(self, data):
        return User.objects.create_user(
            phone=data.get('phone') or None,
            email=data.get('email') or None,
            password=data['password'],
            display_name=data['display_name'],
            wilaya=data['wilaya'],
            preferred_language=data['preferred_language'],
        )

    def to_representation(self, user):
        return {'user': ProfileSerializer(user).data, **tokens_for(user)}


class LoginSerializer(serializers.Serializer):
    phone_or_email = serializers.CharField(
        help_text='Your phone number (e.g. 0555123456) or your email.',
        error_messages={'required': 'Enter your phone number or email.',
                        'blank': 'Enter your phone number or email.'})
    password = serializers.CharField(
        write_only=True, style={'input_type': 'password'}, trim_whitespace=False,
        error_messages={'required': 'Enter your password.', 'blank': 'Enter your password.'})

    def validate(self, data):
        user = authenticate(self.context.get('request'),
                            username=data['phone_or_email'], password=data['password'])
        if user is None:
            # Same message whether the account exists or not, so nobody can use the
            # login form to find out who has an account.
            raise AuthenticationFailed('Wrong phone number/email or password.')
        data['user'] = user
        return data

    def to_representation(self, data):
        user = data['user']
        return {'user': ProfileSerializer(user).data, **tokens_for(user)}
