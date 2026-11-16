"""Tests for the Profile step (Step 2.2 #7): profile photo, public seller profile,
my listings, and deleting an account.

Run with:  python manage.py test
"""

import os
import shutil
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from listings.models import Category, Favorite, Listing
from messaging.models import Conversation, Message
from moderation import actions
from moderation.models import Block, BlockedPhone, ContentFlag, ModerationLog
from souqna_api.wilayas import Wilaya

from .models import User

TEMP_MEDIA = tempfile.mkdtemp(prefix='souqna-test-profile-')
PASSWORD = 'Souqna-2026!'


def photo_with_location(size=(2000, 1500)):
    """A JPEG with hidden data (camera model + GPS-like tag) like phone photos have."""
    image = Image.new('RGB', size, (200, 80, 40))
    exif = Image.Exif()
    exif[0x0110] = 'Secret Phone Model'
    exif[0x8825] = {2: (36, 45, 0)}  # GPS info
    buffer = BytesIO()
    image.save(buffer, format='JPEG', exif=exif)
    return SimpleUploadedFile('me.jpg', buffer.getvalue(), content_type='image/jpeg')


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class ProfileTestCase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        self.seller = User.objects.create_user(phone='0550000001', display_name='Amina',
                                               email='amina@example.com', password=PASSWORD,
                                               wilaya=Wilaya.ALGER, phone_verified=True)
        self.buyer = User.objects.create_user(phone='0660000002', display_name='Yacine',
                                              password=PASSWORD, phone_verified=True)
        self.category = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')

    def make_listing(self, **kwargs):
        data = dict(seller=self.seller, title='Robe', price_dzd=3000, category=self.category,
                    condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER)
        data.update(kwargs)
        return Listing.objects.create(**data)


# 1. Profile photo -----------------------------------------------------------------------

class AvatarTests(ProfileTestCase):
    def upload(self, file=None):
        self.client.force_authenticate(self.seller)
        return self.client.post('/api/auth/me/avatar/', {'image': file or photo_with_location()},
                                format='multipart')

    def test_upload_is_cleaned_resized_and_renamed(self):
        response = self.upload()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['user']['avatar'].startswith('http://testserver/media/avatars/'))
        self.seller.refresh_from_db()
        self.assertRegex(self.seller.avatar.name, r'^avatars/\d{4}/\d{2}/[0-9a-f]{32}\.jpg$')
        with open(self.seller.avatar.path, 'rb') as saved:
            data = saved.read()
        self.assertNotIn(b'Secret Phone Model', data)  # hidden data removed
        with Image.open(self.seller.avatar.path) as image:
            self.assertLessEqual(max(image.size), 600)
            self.assertEqual(len(image.getexif()), 0)

    def test_a_new_photo_replaces_the_old_file(self):
        self.upload()
        self.seller.refresh_from_db()
        old_path = self.seller.avatar.path
        self.upload()
        self.assertFalse(os.path.exists(old_path))

    def test_remove_photo(self):
        self.upload()
        self.seller.refresh_from_db()
        path = self.seller.avatar.path
        response = self.client.delete('/api/auth/me/avatar/')
        self.assertIsNone(response.data['user']['avatar'])
        self.assertFalse(os.path.exists(path))

    def test_not_a_photo(self):
        response = self.upload(SimpleUploadedFile('x.jpg', b'not a photo', content_type='image/jpeg'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_needs_login(self):
        response = self.client.post('/api/auth/me/avatar/', {'image': photo_with_location()},
                                    format='multipart')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_can_remove_a_photo(self):
        self.upload()
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        self.client.force_login(admin)
        self.client.post('/admin/accounts/user/', {'action': 'remove_avatars',
                                                   '_selected_action': [self.seller.id]})
        self.seller.refresh_from_db()
        self.assertFalse(self.seller.avatar)
        self.assertTrue(ModerationLog.objects.filter(action='remove_avatar').exists())


# 2. Public seller profile ---------------------------------------------------------------

class PublicProfileTests(ProfileTestCase):
    def test_public_profile_never_shows_phone_or_email(self):
        self.make_listing()
        self.make_listing(status=Listing.Status.SOLD)
        response = self.client.get(f'/api/users/{self.seller.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {'id', 'display_name', 'wilaya', 'avatar',
                                              'phone_verified', 'member_since', 'items_sold',
                                              'active_listings'})
        self.assertEqual((response.data['items_sold'], response.data['active_listings']), (1, 1))
        text = str(response.content)
        self.assertNotIn('0550000001', text)
        self.assertNotIn('amina@example.com', text)

    def test_listing_details_never_show_the_sellers_phone_or_email(self):
        listing = self.make_listing()
        response = self.client.get(f'/api/listings/{listing.id}/')
        self.assertNotIn('0550000001', str(response.content))
        self.assertNotIn('amina@example.com', str(response.content))
        self.assertIn('avatar', response.data['seller'])

    def test_not_found_for_suspended_deleted_hidden_or_blocked(self):
        url = f'/api/users/{self.seller.id}/'
        for change in ({'is_active': False}, {'hidden_by_reports': True}):
            User.objects.filter(pk=self.seller.pk).update(**change)
            self.assertEqual(self.client.get(url).status_code, 404, change)
            User.objects.filter(pk=self.seller.pk).update(is_active=True, hidden_by_reports=False)
        Block.objects.create(blocker=self.seller, blocked=self.buyer)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_sellers_active_listings(self):
        mine = self.make_listing(title='Mine')
        self.make_listing(title='Other', seller=self.buyer)
        self.make_listing(title='Sold', status=Listing.Status.SOLD)
        response = self.client.get(f'/api/listings/?seller={self.seller.id}')
        self.assertEqual([item['id'] for item in response.data['results']], [mine.id])


class MemberSearchTests(ProfileTestCase):
    def search(self, query):
        return self.client.get('/api/users/', {'search': query})

    def test_find_members_by_name_without_private_data(self):
        response = self.search('ami')
        self.assertEqual([u['display_name'] for u in response.data], ['Amina'])
        self.assertNotIn('0550000001', str(response.content))
        self.assertNotIn('amina@example.com', str(response.content))
        self.assertNotIn('phone', response.data[0])

    def test_at_least_two_letters(self):
        self.assertEqual(self.search('a').data, [])
        self.assertEqual(self.search('').data, [])

    def test_hidden_suspended_deleted_blocked_and_staff_are_not_found(self):
        User.objects.create_superuser(phone='0799999999', password=PASSWORD, display_name='Amina Admin')
        for change in ({'is_active': False}, {'hidden_by_reports': True}):
            User.objects.filter(pk=self.seller.pk).update(**change)
            self.assertEqual(self.search('amina').data, [], change)
            User.objects.filter(pk=self.seller.pk).update(is_active=True, hidden_by_reports=False)
        Block.objects.create(blocker=self.buyer, blocked=self.seller)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.search('amina').data, [])

    def test_at_most_10_results(self):
        for n in range(12):
            User.objects.create_user(phone=f'07700000{n:02d}', display_name=f'Karim {n}')
        self.assertEqual(len(self.search('karim').data), 10)


# 3. My listings --------------------------------------------------------------------------

class MyListingsTests(ProfileTestCase):
    def test_tabs_and_counts(self):
        active = self.make_listing(title='Active')
        reserved = self.make_listing(title='Reserved', status=Listing.Status.RESERVED)
        sold = self.make_listing(title='Sold', status=Listing.Status.SOLD)
        pending = self.make_listing(title='Pending', review_status=Listing.Review.PENDING)
        rejected = self.make_listing(title='Rejected', review_status=Listing.Review.REJECTED)
        self.make_listing(title='Deleted', deleted_at='2026-01-01T00:00:00Z')
        self.make_listing(title='Not mine', seller=self.buyer)
        self.client.force_authenticate(self.seller)

        def ids(tab):
            return {item['id'] for item in
                    self.client.get(f'/api/listings/mine/?tab={tab}').data['results']}

        self.assertEqual(ids('active'), {active.id})
        self.assertEqual(ids('reserved'), {reserved.id})
        self.assertEqual(ids('sold'), {sold.id})
        self.assertEqual(ids('review'), {pending.id, rejected.id})
        response = self.client.get('/api/listings/mine/?tab=review')
        self.assertEqual(response.data['counts'],
                         {'active': 1, 'review': 2, 'reserved': 1, 'sold': 1})
        self.assertIn('review_status', response.data['results'][0])
        self.assertEqual(self.client.get('/api/listings/mine/?tab=nope').status_code, 400)

    def test_needs_login(self):
        self.assertEqual(self.client.get('/api/listings/mine/').status_code, 401)


# 4. Deleting my account -------------------------------------------------------------------

class DeleteAccountTests(ProfileTestCase):
    def delete(self, confirm):
        self.client.force_authenticate(self.seller)
        return self.client.post('/api/auth/delete-account/', {'confirm': confirm}, format='json')

    def test_must_type_the_phone_number(self):
        for typed in ('', '0550000009', 'amina'):
            response = self.delete(typed)
            self.assertEqual((response.status_code, response.data['code']),
                             (400, 'confirm_mismatch'), typed)
        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.deleted_at)

    def test_delete_account_erases_personal_data_and_keeps_evidence(self):
        listing = self.make_listing()
        Favorite.objects.create(user=self.seller, listing=self.make_listing(seller=self.buyer))
        Block.objects.create(blocker=self.seller, blocked=self.buyer)
        conversation = Conversation.objects.create(listing=listing, buyer=self.buyer,
                                                   seller=self.seller)
        Message.objects.create(conversation=conversation, sender=self.seller, text='Bonjour')
        flag = ContentFlag.objects.create(
            source='message', category='insult', severity='warn', strike=True, user=self.seller,
            user_label='Amina (#1)', user_phone='0550000001', content='connard', matched=['connard'])

        response = self.delete('05 50 00 00 01')  # spaces are fine
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.phone)
        self.assertEqual(self.seller.display_name, 'Deleted account')
        self.assertTrue(self.seller.email.endswith('@deleted.invalid'))
        self.assertIsNone(self.seller.wilaya)
        self.assertFalse(self.seller.is_active)
        self.assertFalse(self.seller.has_usable_password())
        self.assertIsNotNone(self.seller.deleted_at)
        # Listings hidden, favourites and blocks gone.
        listing.refresh_from_db()
        self.assertIsNotNone(listing.deleted_at)
        self.assertFalse(Favorite.objects.filter(user=self.seller).exists())
        self.assertFalse(Block.objects.filter(blocker=self.seller).exists())
        # Evidence and history kept.
        flag.refresh_from_db()
        self.assertEqual((flag.content, flag.user_phone), ('connard', '0550000001'))
        self.assertTrue(Message.objects.filter(text='Bonjour').exists())
        log = ModerationLog.objects.get(action='delete_account')
        self.assertIn('0550000001', log.note)

    def test_after_deleting_you_cant_log_in_and_the_phone_can_sign_up_again(self):
        self.delete('0550000001')
        self.client.force_authenticate(None)
        login = self.client.post('/api/auth/login/', {'phone_or_email': '0550000001',
                                                      'password': PASSWORD}, format='json')
        self.assertEqual(login.status_code, 401)
        signup = self.client.post('/api/auth/signup/', {
            'phone': '0550000001', 'password': PASSWORD, 'display_name': 'Amina', 'wilaya': 16},
            format='json')
        self.assertEqual(signup.status_code, 201)

    def test_a_banned_phone_stays_banned_after_deleting(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        actions.ban_user(self.seller, admin)
        self.seller.is_active = True  # (banned users can't log in; simulate an old session)
        self.seller.save()
        self.delete('0550000001')
        self.assertTrue(BlockedPhone.objects.filter(phone='0550000001').exists())
        signup = self.client.post('/api/auth/signup/', {
            'phone': '0550000001', 'password': PASSWORD, 'display_name': 'Amina', 'wilaya': 16},
            format='json')
        self.assertEqual(signup.status_code, 400)

    def test_deleted_account_has_no_public_profile(self):
        self.delete('0550000001')
        self.assertEqual(self.client.get(f'/api/users/{self.seller.id}/').status_code, 404)
