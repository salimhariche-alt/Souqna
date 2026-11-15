"""Tests for sign up, log in, tokens and my profile (/api/auth/).

Run with:  python manage.py test
"""

from django.contrib.auth import authenticate
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from listings.models import Category, Favorite, Listing
from souqna_api.wilayas import Wilaya

from .models import User

PASSWORD = 'Souqna-2026!'


class AuthTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # reset the "10 attempts per minute" counter between tests

    def signup(self, **overrides):
        data = {'phone': '0555123456', 'password': PASSWORD, 'display_name': 'Amina',
                'wilaya': 16}
        data.update(overrides)
        return self.client.post('/api/auth/signup/', data, format='json')

    def login(self, phone_or_email, password=PASSWORD):
        return self.client.post('/api/auth/login/',
                                {'phone_or_email': phone_or_email, 'password': password},
                                format='json')

    def use_token(self, access):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')


# Sign up ---------------------------------------------------------------------

class SignupTests(AuthTestCase):
    def test_signup_with_phone(self):
        response = self.signup()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['phone'], '0555123456')
        self.assertEqual(response.data['user']['display_name'], 'Amina')
        self.assertEqual(response.data['user']['wilaya'], 16)
        self.assertEqual(response.data['user']['preferred_language'], 'ar')
        self.assertNotIn('password', response.data['user'])
        user = User.objects.get(phone='0555123456')
        self.assertIsNone(user.email)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotEqual(user.password, PASSWORD)  # stored scrambled, never as typed

    def test_signup_with_email_only(self):
        response = self.signup(phone='', email='Amina@Example.com', preferred_language='fr')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='amina@example.com')  # saved lowercase
        self.assertIsNone(user.phone)
        self.assertEqual(user.preferred_language, 'fr')

    def test_signup_with_phone_and_email(self):
        response = self.signup(email='amina@example.com')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(phone='0555123456')
        self.assertEqual(user.email, 'amina@example.com')

    def test_phone_is_tidied(self):
        for raw in ['05 55 12 34 56', '+213 555 12 34 56']:
            User.objects.all().delete()
            response = self.signup(phone=raw)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, raw)
            self.assertEqual(response.data['user']['phone'], '0555123456')

    def test_invalid_phone_numbers(self):
        for bad in ['0455123456', '055512345', '05551234567', 'abcdefghij', '+33612345678']:
            response = self.signup(phone=bad)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
            self.assertEqual(response.data['phone'][0],
                             'Enter a valid Algerian mobile number: 10 digits starting with '
                             '05, 06 or 07.')
        self.assertFalse(User.objects.exists())

    def test_06_and_07_numbers_accepted(self):
        self.assertEqual(self.signup(phone='0661234567').status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.signup(phone='0771234567').status_code, status.HTTP_201_CREATED)

    def test_duplicate_phone_number(self):
        self.assertEqual(self.signup().status_code, status.HTTP_201_CREATED)
        response = self.signup(display_name='Someone else', phone='05 55 12 34 56')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['phone'][0], 'This phone number is already registered.')
        self.assertEqual(User.objects.count(), 1)

    def test_duplicate_email_ignores_capitals(self):
        self.assertEqual(self.signup(phone='', email='amina@example.com').status_code,
                         status.HTTP_201_CREATED)
        response = self.signup(phone='', email='AMINA@example.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['email'][0], 'This email is already registered.')

    def test_phone_or_email_required(self):
        response = self.signup(phone='', email='')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['phone'][0], 'Enter a phone number or an email.')

    def test_invalid_email(self):
        response = self.signup(phone='', email='not-an-email')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['email'][0], 'Enter a valid email address.')

    def test_password_at_least_8_characters(self):
        response = self.signup(password='Ab1!xyz')  # 7 characters
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('at least 8 characters', response.data['password'][0])
        self.assertFalse(User.objects.exists())

    def test_too_common_password_rejected(self):
        response = self.signup(password='password123')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('too common', ' '.join(response.data['password']))

    def test_name_and_wilaya_required(self):
        response = self.client.post('/api/auth/signup/',
                                    {'phone': '0555123456', 'password': PASSWORD}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['display_name'][0], 'Please enter your name.')
        self.assertEqual(response.data['wilaya'][0], 'Please choose your wilaya.')

    def test_invalid_wilaya(self):
        response = self.signup(wilaya=59)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['wilaya'][0], 'Choose a wilaya number from 1 to 58.')

    def test_cannot_make_yourself_admin(self):
        response = self.signup(is_staff=True, is_superuser=True)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(phone='0555123456')
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)


# Log in ------------------------------------------------------------------------

class LoginTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(phone='0555123456', email='amina@example.com',
                                             password=PASSWORD, display_name='Amina',
                                             wilaya=Wilaya.ALGER)

    def test_login_with_phone(self):
        response = self.login('0555123456')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['id'], self.user.id)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_login_with_phone_written_with_spaces(self):
        self.assertEqual(self.login('05 55 12 34 56').status_code, status.HTTP_200_OK)

    def test_login_with_email_any_capitals(self):
        response = self.login('Amina@Example.COM')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['id'], self.user.id)

    def test_wrong_password(self):
        response = self.login('0555123456', password='wrong-password')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['detail'], 'Wrong phone number/email or password.')
        self.assertNotIn('access', response.data)

    def test_unknown_account_gives_same_message(self):
        response = self.login('0699999999')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['detail'], 'Wrong phone number/email or password.')

    def test_disabled_account_cannot_log_in(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.login('0555123456').status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_fields(self):
        response = self.client.post('/api/auth/login/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['phone_or_email'][0], 'Enter your phone number or email.')
        self.assertEqual(response.data['password'][0], 'Enter your password.')

    def test_too_many_attempts_are_slowed_down(self):
        codes = [self.login('0555123456', password='wrong').status_code for _ in range(11)]
        self.assertEqual(codes[:10], [status.HTTP_401_UNAUTHORIZED] * 10)
        self.assertEqual(codes[10], status.HTTP_429_TOO_MANY_REQUESTS)

    def test_opening_the_page_does_not_use_up_attempts(self):
        for _ in range(15):
            self.client.get('/api/auth/login/')
        self.assertEqual(self.login('0555123456').status_code, status.HTTP_200_OK)

    def test_admin_login_backend_accepts_phone_or_email(self):
        self.assertEqual(authenticate(username='0555123456', password=PASSWORD), self.user)
        self.assertEqual(authenticate(username='AMINA@example.com', password=PASSWORD), self.user)
        self.assertIsNone(authenticate(username='0555123456', password='nope'))


# Refresh token -------------------------------------------------------------------

class RefreshTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        User.objects.create_user(phone='0555123456', password=PASSWORD, display_name='Amina')
        self.tokens = self.login('0555123456').data

    def test_refresh_gives_new_access_token(self):
        response = self.client.post('/api/auth/refresh/', {'refresh': self.tokens['refresh']},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.use_token(response.data['access'])
        self.assertEqual(self.client.get('/api/auth/me/').status_code, status.HTTP_200_OK)

    def test_bad_refresh_token(self):
        response = self.client.post('/api/auth/refresh/', {'refresh': 'garbage'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_access_token_cannot_be_used_as_refresh_token(self):
        response = self.client.post('/api/auth/refresh/', {'refresh': self.tokens['access']},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# My profile ------------------------------------------------------------------------

class ProfileTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(phone='0555123456', password=PASSWORD,
                                             display_name='Amina', wilaya=Wilaya.ALGER)
        self.use_token(self.login('0555123456').data['access'])

    def test_see_my_profile(self):
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['phone'], '0555123456')
        self.assertEqual(response.data['display_name'], 'Amina')
        self.assertEqual(response.data['wilaya_name'], '16 - Alger')
        self.assertNotIn('password', response.data)

    def test_edit_my_profile(self):
        response = self.client.patch('/api/auth/me/', {'display_name': 'Amina B.', 'wilaya': 31,
                                                       'preferred_language': 'en'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual((self.user.display_name, self.user.wilaya, self.user.preferred_language),
                         ('Amina B.', 31, 'en'))
        self.assertEqual(response.data['wilaya_name'], '31 - Oran')

    def test_phone_email_and_admin_flags_cannot_be_changed_here(self):
        self.client.patch('/api/auth/me/', {'phone': '0666666666', 'email': 'x@example.com',
                                            'is_staff': True}, format='json')
        self.user.refresh_from_db()
        self.assertEqual(self.user.phone, '0555123456')
        self.assertIsNone(self.user.email)
        self.assertFalse(self.user.is_staff)

    def test_invalid_language(self):
        response = self.client.patch('/api/auth/me/', {'preferred_language': 'de'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['preferred_language'][0],
                         'Language must be "ar", "fr" or "en".')

    def test_empty_name_rejected(self):
        response = self.client.patch('/api/auth/me/', {'display_name': ''}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['display_name'][0], 'Please enter your name.')

    def test_must_be_logged_in(self):
        self.client.credentials()  # remove the token
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_bad_token_rejected(self):
        self.use_token('not-a-real-token')
        self.assertEqual(self.client.get('/api/auth/me/').status_code,
                         status.HTTP_401_UNAUTHORIZED)


# Tokens work with the Step 1.3 endpoints ---------------------------------------------

class TokensWithListingsTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.category = Category.objects.create(name_en='Men', name_fr='Hommes', name_ar='رجال')
        response = self.signup(phone='0661234567', display_name='Yacine', wilaya=31)
        self.user = User.objects.get(phone='0661234567')
        self.use_token(response.data['access'])

    def create_listing(self):
        return self.client.post('/api/listings/', {
            'title': 'Veste en cuir', 'price_dzd': 9500, 'category': self.category.id,
            'condition': 'good', 'wilaya': 31}, format='json')

    def test_create_listing_with_token(self):
        response = self.create_listing()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Listing.objects.get(pk=response.data['id']).seller, self.user)

    def test_edit_and_mark_sold_with_token(self):
        listing_id = self.create_listing().data['id']
        response = self.client.patch(f'/api/listings/{listing_id}/', {'status': 'sold'},
                                     format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_favorites_with_token(self):
        listing_id = self.create_listing().data['id']
        self.assertEqual(self.client.post(f'/api/listings/{listing_id}/favorite/').status_code,
                         status.HTTP_201_CREATED)
        response = self.client.get('/api/favorites/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertTrue(Favorite.objects.filter(user=self.user).exists())
        self.assertEqual(self.client.delete(f'/api/listings/{listing_id}/favorite/').status_code,
                         status.HTTP_204_NO_CONTENT)

    def test_without_token_is_refused(self):
        self.client.credentials()
        response = self.create_listing()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['detail'].code, 'not_authenticated')
