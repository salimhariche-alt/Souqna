"""Tests for phone verification by SMS code and the sellers' trust info.

Run with:  python manage.py test
"""

import io
import re
from contextlib import redirect_stdout
from datetime import timedelta

from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from listings.models import Category, Favorite, Listing
from messaging.models import Conversation
from souqna_api.wilayas import Wilaya

from .models import PhoneVerification, User
from .sms import ConsoleSMSBackend, MemorySMSBackend

STATUS = '/api/auth/phone/status/'
SEND = '/api/auth/phone/send-code/'
VERIFY = '/api/auth/phone/verify/'


@override_settings(SMS_BACKEND='accounts.sms.MemorySMSBackend')
class PhoneTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # reset the "10 SMS per hour" counter
        MemorySMSBackend.outbox.clear()
        self.user = User.objects.create_user(phone='0661234589', display_name='Amina',
                                             wilaya=Wilaya.ALGER, preferred_language='fr')
        self.client.force_authenticate(self.user)

    def last_code(self):
        phone, message = MemorySMSBackend.outbox[-1]
        return re.search(r'\b(\d{6})\b', message).group(1)

    def move_back(self, **seconds):
        """Pretend time has passed by moving the saved times back."""
        pending = PhoneVerification.objects.get(user=self.user)
        for field, amount in seconds.items():
            value = getattr(pending, field)
            setattr(pending, field, value - timedelta(seconds=amount))
        pending.save()

    def wrong_code(self, code):
        # Any 6-digit code that isn't the right one.
        return '000000' if code != '000000' else '111111'


# Sending a code ---------------------------------------------------------------

class SendCodeTests(PhoneTestCase):
    def test_must_be_logged_in(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(SEND).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.get(STATUS).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sends_a_6_digit_code_in_my_language(self):
        response = self.client.post(SEND)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['phone'], '0661234589')
        self.assertEqual(response.data['code_expires_in'], 300)  # 5 minutes
        self.assertEqual(response.data['resend_in'], 60)
        phone, message = MemorySMSBackend.outbox[-1]
        self.assertEqual(phone, '0661234589')
        self.assertIn('votre code de vérification est', message)
        self.assertRegex(message, r'\b\d{6}\b')

    def test_arabic_user_gets_arabic_sms(self):
        self.user.preferred_language = 'ar'
        self.user.save()
        self.client.post(SEND)
        self.assertIn('رمز التحقق', MemorySMSBackend.outbox[-1][1])

    def test_code_is_not_stored_readable(self):
        self.client.post(SEND)
        code = self.last_code()
        pending = PhoneVerification.objects.get(user=self.user)
        self.assertNotIn(code, pending.code_hash)
        self.assertEqual(len(pending.code_hash), 64)

    def test_resend_only_after_60_seconds(self):
        self.client.post(SEND)
        response = self.client.post(SEND)
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['code'], 'resend_too_soon')
        self.assertGreater(response.data['retry_in'], 50)
        self.assertEqual(len(MemorySMSBackend.outbox), 1)

        self.move_back(sent_at=61)
        self.assertEqual(self.client.post(SEND).status_code, status.HTTP_200_OK)
        self.assertEqual(len(MemorySMSBackend.outbox), 2)

    def test_new_code_replaces_the_old_one(self):
        self.client.post(SEND)
        old = self.last_code()
        self.move_back(sent_at=61)
        self.client.post(SEND)
        new = self.last_code()
        if old != new:  # (1 in a million chance of the same code)
            response = self.client.post(VERIFY, {'code': old})
            self.assertEqual(response.data['code'], 'wrong_code')
        self.assertEqual(self.client.post(VERIFY, {'code': new}).status_code, status.HTTP_200_OK)

    def test_status_shows_countdowns(self):
        self.assertEqual(self.client.get(STATUS).data['resend_in'], 0)
        self.client.post(SEND)
        data = self.client.get(STATUS).data
        self.assertFalse(data['phone_verified'])
        self.assertGreater(data['resend_in'], 50)
        self.assertGreater(data['code_expires_in'], 290)

    def test_at_most_10_sms_per_hour(self):
        codes = []
        for _ in range(11):
            codes.append(self.client.post(SEND).status_code)
            PhoneVerification.objects.filter(user=self.user).update(
                sent_at=timezone.now() - timedelta(seconds=61))
        self.assertEqual(codes[:10], [status.HTTP_200_OK] * 10)
        self.assertEqual(codes[10], status.HTTP_429_TOO_MANY_REQUESTS)

    def test_already_verified(self):
        self.user.phone_verified = True
        self.user.save()
        response = self.client.post(SEND)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'already_verified')


# Checking the code ------------------------------------------------------------

class VerifyCodeTests(PhoneTestCase):
    def test_right_code_verifies_the_phone(self):
        self.client.post(SEND)
        response = self.client.post(VERIFY, {'code': self.last_code()})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['user']['phone_verified'])
        self.user.refresh_from_db()
        self.assertTrue(self.user.phone_verified)
        self.assertIsNotNone(self.user.phone_verified_at)
        self.assertFalse(PhoneVerification.objects.exists())  # used code is deleted
        self.assertTrue(self.client.get('/api/auth/me/').data['phone_verified'])

    def test_wrong_code_counts_down(self):
        self.client.post(SEND)
        wrong = self.wrong_code(self.last_code())
        lefts = [self.client.post(VERIFY, {'code': wrong}).data.get('attempts_left')
                 for _ in range(4)]
        self.assertEqual(lefts, [4, 3, 2, 1])
        self.user.refresh_from_db()
        self.assertFalse(self.user.phone_verified)

    def test_5_wrong_codes_lock_for_15_minutes(self):
        self.client.post(SEND)
        right = self.last_code()
        wrong = self.wrong_code(right)
        for _ in range(4):
            self.client.post(VERIFY, {'code': wrong})
        fifth = self.client.post(VERIFY, {'code': wrong})
        self.assertEqual(fifth.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(fifth.data['code'], 'locked')
        self.assertEqual(fifth.data['retry_in'], 15 * 60)

        # Even the right code, or a new code, doesn't work while locked.
        self.assertEqual(self.client.post(VERIFY, {'code': right}).data['code'], 'locked')
        self.move_back(sent_at=61)
        self.assertEqual(self.client.post(SEND).data['code'], 'locked')
        self.assertGreater(self.client.get(STATUS).data['locked_for'], 800)

        # After 15 minutes: ask for a new code and it works again.
        self.move_back(locked_until=15 * 60 + 1, sent_at=15 * 60)
        self.assertEqual(self.client.post(SEND).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(VERIFY, {'code': self.last_code()}).status_code,
                         status.HTTP_200_OK)

    def test_new_codes_dont_reset_the_wrong_attempts(self):
        self.client.post(SEND)
        for _ in range(4):
            self.client.post(VERIFY, {'code': self.wrong_code(self.last_code())})
        self.move_back(sent_at=61)
        self.client.post(SEND)  # a fresh code...
        response = self.client.post(VERIFY, {'code': self.wrong_code(self.last_code())})
        self.assertEqual(response.data['code'], 'locked')  # ...but still the 5th wrong try

    def test_code_expires_after_5_minutes(self):
        self.client.post(SEND)
        code = self.last_code()
        self.move_back(expires_at=301)
        response = self.client.post(VERIFY, {'code': code})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'code_expired')

    def test_no_code_asked_yet(self):
        response = self.client.post(VERIFY, {'code': '123456'})
        self.assertEqual(response.data['code'], 'no_code')

    def test_code_must_be_6_digits_and_doesnt_count_as_an_attempt(self):
        self.client.post(SEND)
        for bad in ['12345', '1234567', 'abcdef', '']:
            self.assertEqual(self.client.post(VERIFY, {'code': bad}).data['code'], 'invalid_code')
        self.assertEqual(PhoneVerification.objects.get(user=self.user).failed_attempts, 0)


# Accounts without a phone (signed up with an email) ------------------------------

class EmailOnlyAccountTests(PhoneTestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email='nadia@example.com', display_name='Nadia')
        self.client.force_authenticate(self.user)

    def test_needs_a_phone_number(self):
        response = self.client.post(SEND)
        self.assertEqual(response.data['code'], 'phone_required')

    def test_phone_becomes_mine_only_after_the_right_code(self):
        response = self.client.post(SEND, {'phone': '07 71 23 45 67'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(MemorySMSBackend.outbox[-1][0], '0771234567')
        self.user.refresh_from_db()
        self.assertIsNone(self.user.phone)  # not yet

        self.client.post(VERIFY, {'code': self.last_code()})
        self.user.refresh_from_db()
        self.assertEqual(self.user.phone, '0771234567')
        self.assertTrue(self.user.phone_verified)

    def test_invalid_or_taken_phone(self):
        self.assertEqual(
            self.client.post(SEND, {'phone': '0812345678'}, format='json').data['code'],
            'phone_invalid')
        self.assertEqual(
            self.client.post(SEND, {'phone': '0661234589'}, format='json').data['code'],
            'phone_taken')  # Amina's number


# Posting and messaging need a verified phone ----------------------------------------

class VerifiedOnlyTests(PhoneTestCase):
    def setUp(self):
        super().setUp()
        self.category = Category.objects.create(name_en='Men', name_fr='Hommes', name_ar='رجال')
        self.seller = User.objects.create_user(phone='0550000001', display_name='Seller',
                                               phone_verified=True)
        self.listing = Listing.objects.create(
            seller=self.seller, title='Veste', price_dzd=9500, category=self.category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ORAN)

    def new_listing(self):
        return self.client.post('/api/listings/', {
            'title': 'Montre', 'price_dzd': 8000, 'category': self.category.id,
            'condition': 'good', 'wilaya': 16}, format='json')

    def assertNotVerified(self, response):
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'phone_not_verified')

    def test_unverified_user_cannot_post_a_listing(self):
        self.assertNotVerified(self.new_listing())
        self.assertEqual(Listing.objects.filter(seller=self.user).count(), 0)

    def test_unverified_user_cannot_message(self):
        self.assertNotVerified(self.client.post(
            '/api/conversations/', {'listing': self.listing.id, 'text': 'Salam'}, format='json'))
        conversation = Conversation.objects.create(listing=self.listing, buyer=self.user,
                                                   seller=self.seller)
        self.assertNotVerified(self.client.post(
            f'/api/conversations/{conversation.id}/messages/', {'text': 'Salam'}, format='json'))

    def test_unverified_user_can_still_browse_and_use_favorites(self):
        self.assertEqual(self.client.get('/api/listings/').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f'/api/listings/{self.listing.id}/').status_code,
                         status.HTTP_200_OK)
        self.assertEqual(self.client.post(f'/api/listings/{self.listing.id}/favorite/').status_code,
                         status.HTTP_201_CREATED)
        self.assertTrue(Favorite.objects.filter(user=self.user).exists())
        self.assertEqual(self.client.get('/api/conversations/').status_code, status.HTTP_200_OK)

    def test_after_verifying_everything_works(self):
        self.client.post(SEND)
        self.client.post(VERIFY, {'code': self.last_code()})
        self.assertEqual(self.new_listing().status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.client.post(
            '/api/conversations/', {'listing': self.listing.id, 'text': 'Salam'},
            format='json').status_code, status.HTTP_201_CREATED)

    def test_visitors_still_get_please_log_in(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.new_listing().status_code, status.HTTP_401_UNAUTHORIZED)


# Trust info about sellers ------------------------------------------------------------

class TrustInfoTests(PhoneTestCase):
    def test_listing_details_show_seller_trust_info(self):
        category = Category.objects.create(name_en='Home', name_fr='Maison', name_ar='المنزل')
        seller = User.objects.create_user(phone='0550000002', display_name='Karim',
                                          phone_verified=True)
        make = lambda status_: Listing.objects.create(  # noqa: E731
            seller=seller, title='Tapis', price_dzd=1000, category=category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER, status=status_)
        active = make('active')
        make('sold')
        make('sold')
        make('reserved')

        self.client.force_authenticate(None)
        info = self.client.get(f'/api/listings/{active.id}/').data['seller']
        self.assertTrue(info['phone_verified'])
        self.assertEqual(info['items_sold'], 2)
        self.assertEqual(info['member_since'][:10], seller.date_joined.date().isoformat())
        self.assertNotIn('phone', info)

        # Items sold is counted live: setting one back to active lowers it.
        one_sold = Listing.objects.filter(seller=seller, status='sold').first()
        Listing.objects.filter(pk=one_sold.pk).update(status='active')
        self.assertEqual(self.client.get(f'/api/listings/{active.id}/').data['seller']['items_sold'], 1)

    def test_my_profile_shows_verification_and_items_sold(self):
        data = self.client.get('/api/auth/me/').data
        self.assertIs(data['phone_verified'], False)
        self.assertIsNone(data['phone_verified_at'])
        self.assertEqual(data['items_sold'], 0)

    def test_profile_cannot_mark_itself_verified(self):
        self.client.patch('/api/auth/me/', {'phone_verified': True}, format='json')
        self.user.refresh_from_db()
        self.assertFalse(self.user.phone_verified)


# The development SMS sender ------------------------------------------------------------

class ConsoleBackendTests(PhoneTestCase):
    def test_prints_the_sms_in_the_terminal(self):
        output = io.StringIO()
        with redirect_stdout(output):
            ConsoleSMSBackend().send('0661234589', 'Souqna : votre code est 123456.')
        printed = output.getvalue()
        self.assertIn('0661234589', printed)
        self.assertIn('123456', printed)

    @override_settings(SMS_BACKEND='accounts.sms.ConsoleSMSBackend')
    def test_the_setting_chooses_the_sender(self):
        output = io.StringIO()
        with redirect_stdout(output):
            self.client.post(SEND)
        self.assertRegex(output.getvalue(), r'\b\d{6}\b')
        self.assertEqual(MemorySMSBackend.outbox, [])  # the memory sender wasn't used
