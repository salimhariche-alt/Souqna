"""Tests for beta mode (Step 4.1): invite codes, verification by an admin, app config.

Run with:  python manage.py test
"""

from datetime import timedelta

from django.core.cache import cache
from django.test import Client, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from moderation.models import ModerationLog
from souqna_api.wilayas import Wilaya

from .models import InviteCode, User, normalize_invite_code
from .sms import MemorySMSBackend

SIGNUP = '/api/auth/signup/'
CONFIG = '/api/auth/config/'
STATUS = '/api/auth/phone/status/'
SEND = '/api/auth/phone/send-code/'
PASSWORD = 'Sougna-2026!'
USERS_ADMIN = '/admin/accounts/user/'


def signup_data(**extra):
    data = {'phone': '0661234500', 'password': PASSWORD, 'display_name': 'Tester',
            'wilaya': Wilaya.ORAN, 'preferred_language': 'fr'}
    data.update(extra)
    return data


class BetaTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # reset the sign-up attempt counter
        MemorySMSBackend.outbox.clear()
        self.invite = InviteCode.objects.create(name='Family Oran', max_uses=2)


# Invite codes -------------------------------------------------------------------

class InviteCodeModelTests(BetaTestCase):
    def test_random_code_made_when_empty(self):
        self.assertEqual(len(self.invite.code), 8)
        self.assertTrue(self.invite.code.isalnum())
        self.assertEqual(self.invite.code, self.invite.code.upper())
        for confusing in 'O0I1L':
            self.assertNotIn(confusing, self.invite.code)

    def test_own_code_is_tidied(self):
        invite = InviteCode.objects.create(name='Friends', code=' fam-oran 26 ')
        self.assertEqual(invite.code, 'FAMORAN26')
        self.assertEqual(normalize_invite_code('fam oran-26'), 'FAMORAN26')

    def test_expires_in_30_days_by_default(self):
        days = (self.invite.expires_at - timezone.now()).days
        self.assertIn(days, (29, 30))


@override_settings(BETA_MODE=True, SMS_BACKEND='accounts.sms.MemorySMSBackend')
class BetaSignupTests(BetaTestCase):
    def test_invite_code_required(self):
        response = self.client.post(SIGNUP, signup_data(), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['invite_code'], ['Enter your invite code.'])
        self.assertFalse(User.objects.exists())

    def test_unknown_code_refused(self):
        response = self.client.post(SIGNUP, signup_data(invite_code='NOPE2345'), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("doesn't exist", response.data['invite_code'][0])

    def test_good_code_any_case_with_spaces(self):
        typed = ' ' + self.invite.code[:4].lower() + '-' + self.invite.code[4:] + ' '
        response = self.client.post(SIGNUP, signup_data(invite_code=typed), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = User.objects.get(phone='0661234500')
        self.assertEqual(user.invite_code, self.invite)
        self.assertFalse(user.phone_verified)  # waits for the admin
        self.assertEqual(MemorySMSBackend.outbox, [])  # no SMS sent

    def test_turned_off_code_refused(self):
        self.invite.is_active = False
        self.invite.save()
        response = self.client.post(SIGNUP, signup_data(invite_code=self.invite.code),
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['invite_code'], ['This invite code is no longer valid.'])

    def test_expired_code_refused(self):
        self.invite.expires_at = timezone.now() - timedelta(minutes=1)
        self.invite.save()
        response = self.client.post(SIGNUP, signup_data(invite_code=self.invite.code),
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['invite_code'], ['This invite code has expired.'])

    def test_code_used_up_after_max_uses(self):
        for n, phone in enumerate(['0661234501', '0661234502']):
            response = self.client.post(
                SIGNUP, signup_data(phone=phone, display_name=f'Tester {n}',
                                    invite_code=self.invite.code), format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        response = self.client.post(SIGNUP, signup_data(phone='0661234503',
                                                        invite_code=self.invite.code),
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('maximum number', response.data['invite_code'][0])
        self.assertEqual(self.invite.users.count(), 2)

    def test_phone_required_during_beta(self):
        data = signup_data(invite_code=self.invite.code, email='tester@example.com')
        del data['phone']
        response = self.client.post(SIGNUP, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['phone'],
                         ['During the beta, sign up with a phone number.'])


@override_settings(BETA_MODE=False, SMS_BACKEND='accounts.sms.MemorySMSBackend')
class NormalModeTests(BetaTestCase):
    def test_no_invite_code_needed(self):
        response = self.client.post(SIGNUP, signup_data(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIsNone(User.objects.get(phone='0661234500').invite_code)

    def test_invite_code_ignored(self):
        response = self.client.post(SIGNUP, signup_data(invite_code='WHATEVER'), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_email_only_still_allowed(self):
        data = signup_data(email='tester@example.com')
        del data['phone']
        response = self.client.post(SIGNUP, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_sms_codes_work_as_before(self):
        user = User.objects.create_user(phone='0661234599', display_name='A')
        self.client.force_authenticate(user)
        response = self.client.post(SEND, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(MemorySMSBackend.outbox), 1)
        self.assertFalse(self.client.get(STATUS).data['beta_mode'])

    def test_config_says_beta_off(self):
        self.assertEqual(self.client.get(CONFIG).data, {'beta_mode': False})


# Verification during the beta ---------------------------------------------------

@override_settings(BETA_MODE=True, SMS_BACKEND='accounts.sms.MemorySMSBackend')
class BetaVerificationTests(BetaTestCase):
    def setUp(self):
        super().setUp()
        self.tester = User.objects.create_user(phone='0661234510', display_name='Tester',
                                               invite_code=self.invite)

    def test_config_says_beta_on_without_login(self):
        response = self.client.get(CONFIG)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'beta_mode': True})

    def test_no_sms_during_beta(self):
        self.client.force_authenticate(self.tester)
        response = self.client.post(SEND, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'beta_manual_verification')
        self.assertEqual(MemorySMSBackend.outbox, [])

    def test_status_tells_the_app(self):
        self.client.force_authenticate(self.tester)
        data = self.client.get(STATUS).data
        self.assertTrue(data['beta_mode'])
        self.assertFalse(data['phone_verified'])


@override_settings(BETA_MODE=True)
class BetaAdminTests(BetaTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser(phone='0799999990', password=PASSWORD,
                                                   display_name='Admin')
        self.browser = Client()
        self.browser.force_login(self.admin)
        self.tester = User.objects.create_user(phone='0661234520', display_name='Waiting Tester',
                                               invite_code=self.invite)
        self.other = User.objects.create_user(phone='0661234521', display_name='Other Tester',
                                              invite_code=self.invite)

    def test_list_shows_verify_buttons_and_waiting_count(self):
        page = self.browser.get(USERS_ADMIN)
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, f'name="_verify_user" value="{self.tester.pk}"')
        self.assertContains(page, 'account(s) waiting for verification')

    def test_one_click_verify(self):
        response = self.browser.post(USERS_ADMIN, {'_verify_user': self.tester.pk})
        self.assertEqual(response.status_code, 302)
        self.tester.refresh_from_db()
        self.other.refresh_from_db()
        self.assertTrue(self.tester.phone_verified)
        self.assertIsNotNone(self.tester.phone_verified_at)
        self.assertFalse(self.other.phone_verified)  # only the one clicked
        self.assertTrue(ModerationLog.objects.filter(
            action=ModerationLog.Action.VERIFY_PHONE, target_id=self.tester.pk).exists())

    def test_verify_several_at_once(self):
        response = self.browser.post(USERS_ADMIN, {
            'action': 'mark_phone_verified',
            '_selected_action': [self.tester.pk, self.other.pk],
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(User.objects.filter(phone_verified=True,
                                             invite_code=self.invite).count(), 2)

    def test_waiting_filter(self):
        User.objects.filter(pk=self.other.pk).update(phone_verified=True)
        page = self.browser.get(USERS_ADMIN + '?waiting=yes')
        self.assertContains(page, 'Waiting Tester')
        self.assertNotContains(page, 'Other Tester')

    def test_normal_users_cannot_verify(self):
        staff = User.objects.create_user(phone='0661234530', display_name='Staff',
                                         password=PASSWORD, is_staff=True)
        browser = Client()
        browser.force_login(staff)  # staff without permissions
        browser.post(USERS_ADMIN, {'_verify_user': self.tester.pk})
        self.tester.refresh_from_db()
        self.assertFalse(self.tester.phone_verified)

    def test_invite_code_pages(self):
        page = self.browser.get('/admin/accounts/invitecode/')
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, 'Family Oran')
        self.assertContains(page, '2 / 2')  # used 2 of 2
        self.assertContains(page, 'used up')
        page = self.browser.get(f'/admin/accounts/invitecode/{self.invite.pk}/change/')
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, 'Waiting Tester')
        self.assertContains(page, self.invite.code)

    def test_create_code_in_admin(self):
        response = self.browser.post('/admin/accounts/invitecode/add/', {
            'name': 'Friends Alger', 'code': '', 'max_uses': 5,
            'expires_at_0': (timezone.now() + timedelta(days=60)).strftime('%Y-%m-%d'),
            'expires_at_1': '23:59:00', 'is_active': 'on',
        })
        self.assertEqual(response.status_code, 302, response.content[:2000])
        invite = InviteCode.objects.get(name='Friends Alger')
        self.assertEqual(len(invite.code), 8)
        self.assertEqual(invite.max_uses, 5)

    def test_used_code_cannot_be_deleted(self):
        page = self.browser.post(f'/admin/accounts/invitecode/{self.invite.pk}/delete/',
                                 {'post': 'yes'})
        self.assertTrue(InviteCode.objects.filter(pk=self.invite.pk).exists())
        self.assertEqual(page.status_code, 200)  # Django explains why it can't
