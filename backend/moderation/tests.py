"""Tests for the automatic protection against scammers (moderation).

Run with:  python manage.py test
"""

import random
import shutil
import tempfile
from datetime import timedelta
from io import BytesIO

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from listings.models import Category, Favorite, Listing, ListingPhoto
from messaging.models import Conversation
from souqna_api.wilayas import Wilaya

from . import actions
from .images import different_bits, fingerprint, is_too_plain
from .limits import LIMITS
from .models import BlockedPhone, Device, DeviceAccount, FlaggedKeyword, ModerationLog
from .text import find_keywords, find_link, find_phone_number, simplify

TEMP_MEDIA = tempfile.mkdtemp(prefix='souqna-moderation-media-')
PASSWORD = 'Souqna-2026!'


def photo_bytes(seed=1, size=(300, 300), exif=None, fmt='JPEG'):
    """A photo with real detail (random coloured blocks), optionally with EXIF data."""
    rng = random.Random(seed)
    image = Image.new('RGB', (12, 12))
    image.putdata([(rng.randrange(256), rng.randrange(256), rng.randrange(256))
                   for _ in range(144)])
    image = image.resize(size, Image.NEAREST)
    buffer = BytesIO()
    if exif is not None:
        image.save(buffer, format=fmt, exif=exif)
    else:
        image.save(buffer, format=fmt)
    return buffer.getvalue()


def upload(name='photo.jpg', data=None):
    return SimpleUploadedFile(name, data or photo_bytes(), content_type='image/jpeg')


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class ModerationTestCase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        self.category = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')
        self.seller = self.make_user('0550000001', 'Amina')
        self.other = self.make_user('0660000002', 'Yacine')

    def make_user(self, phone, name, days_old=0, **extra):
        user = User.objects.create_user(phone=phone, display_name=name, password=PASSWORD,
                                        phone_verified=True, **extra)
        if days_old:
            User.objects.filter(pk=user.pk).update(
                date_joined=timezone.now() - timedelta(days=days_old))
            user.refresh_from_db()
        return user

    def make_listing(self, seller=None, **kwargs):
        data = dict(seller=seller or self.seller, title='Robe kabyle', description='Belle robe',
                    price_dzd=10000, category=self.category, condition=Listing.Condition.GOOD,
                    wilaya=Wilaya.ALGER)
        data.update(kwargs)
        return Listing.objects.create(**data)

    def post_listing(self, user=None, **overrides):
        self.client.force_authenticate(user or self.seller)
        body = {'title': 'Robe kabyle', 'description': 'Belle robe, portée une fois.',
                'price_dzd': 10000, 'category': self.category.id, 'condition': 'good',
                'wilaya': 16}
        body.update(overrides)
        return self.client.post('/api/listings/', body, format='json')

    def review_status(self, response_or_id):
        listing_id = response_or_id if isinstance(response_or_id, int) else response_or_id.data['id']
        return Listing.objects.get(pk=listing_id).review_status

    def reasons(self, listing_id):
        return [r['code'] for r in Listing.objects.get(pk=listing_id).flag_reasons]


# 1. Daily limits ---------------------------------------------------------------

class DailyLimitTests(ModerationTestCase):
    def test_new_account_max_10_listings_a_day(self):
        for i in range(LIMITS['listings'][0]):
            self.make_listing(title=f'Item {i}')
        response = self.post_listing()
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['code'], 'daily_limit')
        self.assertEqual(response.data['kind'], 'listings')
        self.assertEqual(response.data['limit'], 10)

    def test_under_the_limit_is_fine(self):
        for i in range(9):
            self.make_listing(title=f'Item {i}')
        self.assertEqual(self.post_listing().status_code, status.HTTP_201_CREATED)

    def test_older_account_max_50_listings_a_day(self):
        veteran = self.make_user('0770000003', 'Karim', days_old=15)
        for i in range(10):
            self.make_listing(seller=veteran, title=f'Item {i}')
        self.assertEqual(self.post_listing(veteran).status_code, status.HTTP_201_CREATED)
        for i in range(40):
            self.make_listing(seller=veteran, title=f'More {i}')
        response = self.post_listing(veteran)
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['limit'], 50)

    def test_listings_older_than_24_hours_dont_count(self):
        for i in range(10):
            listing = self.make_listing(title=f'Item {i}')
            Listing.objects.filter(pk=listing.pk).update(
                created_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(self.post_listing().status_code, status.HTTP_201_CREATED)

    def test_new_account_max_20_new_conversations_a_day(self):
        target = self.make_listing(seller=self.other)
        for i in range(LIMITS['conversations'][0]):
            listing = self.make_listing(seller=self.other, title=f'Item {i}')
            Conversation.objects.create(listing=listing, buyer=self.seller, seller=self.other)
        self.client.force_authenticate(self.seller)
        response = self.client.post('/api/conversations/', {'listing': target.id, 'text': 'Salam'},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['kind'], 'conversations')
        self.assertEqual(response.data['limit'], 20)

    def test_more_messages_in_an_existing_conversation_dont_count(self):
        existing = self.make_listing(seller=self.other, title='Existing')
        Conversation.objects.create(listing=existing, buyer=self.seller, seller=self.other)
        for i in range(19):
            listing = self.make_listing(seller=self.other, title=f'Item {i}')
            Conversation.objects.create(listing=listing, buyer=self.seller, seller=self.other)
        self.client.force_authenticate(self.seller)
        response = self.client.post('/api/conversations/',
                                    {'listing': existing.id, 'text': 'Encore une question'},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)  # reused, not new


# 2a. Price much lower than usual ---------------------------------------------------

class LowPriceTests(ModerationTestCase):
    def fill_category(self, count, price=10000):
        for i in range(count):
            self.make_listing(seller=self.other, title=f'Robe {i}', price_dzd=price + i * 100)

    def test_less_than_30_percent_of_typical_price_is_flagged(self):
        self.fill_category(10)
        response = self.post_listing(price_dzd=2000)
        self.assertEqual(self.review_status(response), Listing.Review.PENDING)
        self.assertEqual(self.reasons(response.data['id']), ['low_price'])

    def test_normal_low_price_is_fine(self):
        self.fill_category(10)
        self.assertEqual(self.review_status(self.post_listing(price_dzd=4000)),
                         Listing.Review.APPROVED)

    def test_needs_at_least_10_listings_in_the_category(self):
        self.fill_category(9)
        self.assertEqual(self.review_status(self.post_listing(price_dzd=500)),
                         Listing.Review.APPROVED)


# 2b. Phone numbers, links and payment words in the text ----------------------------

class TextFlagTests(ModerationTestCase):
    def assertFlagged(self, code, **text):
        response = self.post_listing(**text)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.review_status(response), Listing.Review.PENDING, text)
        self.assertIn(code, self.reasons(response.data['id']), text)

    def assertClean(self, **text):
        response = self.post_listing(**text)
        self.assertEqual(self.review_status(response), Listing.Review.APPROVED, text)

    def test_phone_numbers(self):
        for description in ['Appelez le 0555 12 34 56', 'tel: +213 555 123 456',
                            'Contact 0.5.5.5.1.2.3.4.5.6', 'اتصل ٠٥٥٥١٢٣٤٥٦']:
            self.assertFlagged('contact_phone', description=description)

    def test_links(self):
        for description in ['Voir https://exemple.com/robe', 'www.monsite.dz',
                            'Écrivez-moi sur wa.me/213555', 'Plus sur boutique-robes.com']:
            self.assertFlagged('contact_link', description=description)

    def test_payment_in_advance_words_in_every_language(self):
        for description in ['Versement avant envoi', 'Paiement par CCP uniquement',
                            'BaridiMob accepté', 'يجب الدفع مسبقا', 'الدَّفْعُ مُسبقاً من فضلك',
                            'Khlass 9bel w nab3atlek', 'Pay in advance please',
                            'VERSÉMENT obligatoire']:
            self.assertFlagged('advance_payment', description=description)

    def test_normal_text_is_fine(self):
        for description in ["Robe portée une fois, taille M, prix à débattre.",
                            "Je l'ai achetée en avancement de saison",  # "avancement" != "avance"
                            'فستان جميل بحالة جيدة جدا', 'Size 38, 120 000 DA négociable']:
            self.assertClean(description=description)

    def test_word_list_is_editable(self):
        self.assertClean(description='Paiement par Edahabia')
        FlaggedKeyword.objects.create(phrase='edahabia', language='fr', note='card payment')
        self.assertFlagged('advance_payment', description='Paiement par Edahabia')
        FlaggedKeyword.objects.filter(phrase='ccp').update(active=False)
        self.assertClean(description='Paiement par CCP')

    def test_editing_the_text_checks_again_but_marking_sold_doesnt(self):
        response = self.post_listing(description='Très belle robe')
        listing_id = response.data['id']
        self.assertEqual(self.review_status(listing_id), Listing.Review.APPROVED)

        FlaggedKeyword.objects.create(phrase='robe', language='fr')  # now "robe" is suspicious
        self.client.patch(f'/api/listings/{listing_id}/', {'status': 'sold'}, format='json')
        self.assertEqual(self.review_status(listing_id), Listing.Review.APPROVED)

        self.client.patch(f'/api/listings/{listing_id}/', {'description': 'Versement avant'},
                          format='json')
        self.assertEqual(self.review_status(listing_id), Listing.Review.PENDING)

    def test_text_helpers(self):
        self.assertEqual(simplify('VERSÉMENT'), 'versement')
        self.assertEqual(simplify('الدَّفْعُ'), 'الدفع')
        self.assertEqual(simplify('أإآ'), 'ااا')
        self.assertIsNone(find_phone_number('Prix 120 000 DA, taille 38'))
        self.assertIsNone(find_link('Robe taille M.'))
        self.assertEqual(find_keywords('Paiement CCP', ['ccp', 'versement']), ['ccp'])


# Who can see a flagged listing ----------------------------------------------------

class VisibilityTests(ModerationTestCase):
    def setUp(self):
        super().setUp()
        self.flagged = self.make_listing(title='Flagged', review_status=Listing.Review.PENDING)
        self.ok = self.make_listing(title='Normal')

    def test_hidden_from_everyone_else(self):
        self.client.force_authenticate(None)
        titles = [r['title'] for r in self.client.get('/api/listings/').data['results']]
        self.assertEqual(titles, ['Normal'])
        self.assertEqual(self.client.get(f'/api/listings/{self.flagged.id}/').status_code,
                         status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/listings/{self.flagged.id}/').status_code,
                         status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post(f'/api/listings/{self.flagged.id}/favorite/').status_code,
                         status.HTTP_404_NOT_FOUND)
        response = self.client.post('/api/conversations/',
                                    {'listing': self.flagged.id, 'text': 'Salam'}, format='json')
        self.assertEqual(response.data['listing'][0], "This listing doesn't exist.")

    def test_seller_still_sees_it_with_its_review_status(self):
        self.client.force_authenticate(self.seller)
        response = self.client.get(f'/api/listings/{self.flagged.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['review_status'], 'pending_review')
        self.assertNotIn('flag_reasons', response.data)  # the reasons stay admin-only

    def test_approved_listing_becomes_visible(self):
        actions.approve_listing(self.flagged, actor=self.other)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/listings/{self.flagged.id}/').status_code,
                         status.HTTP_200_OK)

    def test_rejected_listing_stays_hidden(self):
        actions.reject_listing(self.flagged, actor=self.other)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/listings/{self.flagged.id}/').status_code,
                         status.HTTP_404_NOT_FOUND)

    def test_seller_cannot_approve_their_own_listing(self):
        self.client.force_authenticate(self.seller)
        self.client.patch(f'/api/listings/{self.flagged.id}/',
                          {'review_status': 'approved'}, format='json')
        self.assertEqual(self.review_status(self.flagged.id), Listing.Review.PENDING)


# 2c + 3. Photos: hidden data removed, copies detected -------------------------------

class PhotoTests(ModerationTestCase):
    def upload_to(self, listing, data, user=None):
        self.client.force_authenticate(user or listing.seller)
        return self.client.post(f'/api/listings/{listing.id}/photos/',
                                {'image': upload(data=data)}, format='multipart')

    def test_hidden_data_is_removed_and_photo_turned_upright(self):
        exif = Image.Exif()
        exif[0x010F] = 'PhoneMaker'   # camera maker
        exif[0x0110] = 'PhoneModel X'  # camera model
        exif[0x0112] = 6               # "rotated 90°": a 300x200 photo is really 200x300
        data = photo_bytes(size=(300, 200), exif=exif)
        with Image.open(BytesIO(data)) as original:
            self.assertEqual(original.getexif().get(0x0110), 'PhoneModel X')

        listing = self.make_listing()
        response = self.upload_to(listing, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        photo = ListingPhoto.objects.get(listing=listing)
        with photo.image.open('rb') as saved, Image.open(saved) as image:
            self.assertEqual(len(image.getexif()), 0)  # no hidden data at all
            self.assertEqual(image.size, (200, 300))   # turned upright
        self.assertRegex(photo.fingerprint, r'^[0-9a-f]{16}$')

    def test_copy_of_another_sellers_photo_is_flagged(self):
        original = self.make_listing()
        self.upload_to(original, photo_bytes(seed=7, size=(300, 300)))
        copy = self.make_listing(seller=self.other, title='Same dress')
        self.upload_to(copy, photo_bytes(seed=7, size=(450, 450)))  # resized copy
        self.assertEqual(self.review_status(copy.id), Listing.Review.PENDING)
        self.assertEqual(self.reasons(copy.id), ['duplicate_photo'])
        self.assertEqual(self.review_status(original.id), Listing.Review.APPROVED)

    def test_reusing_your_own_photo_is_fine(self):
        first = self.make_listing()
        self.upload_to(first, photo_bytes(seed=7))
        second = self.make_listing(title='Same seller, again')
        self.upload_to(second, photo_bytes(seed=7))
        self.assertEqual(self.review_status(second.id), Listing.Review.APPROVED)

    def test_different_photos_are_fine(self):
        self.upload_to(self.make_listing(), photo_bytes(seed=1))
        other = self.make_listing(seller=self.other)
        self.upload_to(other, photo_bytes(seed=2))
        self.assertEqual(self.review_status(other.id), Listing.Review.APPROVED)

    def test_fingerprint_helpers(self):
        a = fingerprint(BytesIO(photo_bytes(seed=3, size=(300, 300))))
        b = fingerprint(BytesIO(photo_bytes(seed=3, size=(640, 640))))
        c = fingerprint(BytesIO(photo_bytes(seed=4)))
        self.assertLessEqual(different_bits(a, b), 6)
        self.assertGreater(different_bits(a, c), 6)
        plain = BytesIO()
        Image.new('RGB', (100, 100), 'white').save(plain, format='JPEG')
        self.assertTrue(is_too_plain(fingerprint(plain)))


# 4. Device IDs ---------------------------------------------------------------------

class DeviceTests(ModerationTestCase):
    DEVICE = 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff'

    def signup(self, phone, device_id=DEVICE):
        self.client.force_authenticate(None)
        return self.client.post('/api/auth/signup/', {
            'phone': phone, 'password': PASSWORD, 'display_name': 'Test', 'wilaya': 16,
            'device_id': device_id}, format='json')

    def test_sign_up_and_log_in_record_the_device(self):
        self.assertEqual(self.signup('0661000001').status_code, status.HTTP_201_CREATED)
        device = Device.objects.get(device_id=self.DEVICE)
        self.assertEqual(device.accounts.count(), 1)
        self.client.post('/api/auth/login/', {'phone_or_email': '0550000001',
                                              'password': PASSWORD, 'device_id': self.DEVICE},
                         format='json')
        self.assertEqual(device.accounts.count(), 2)

    def test_nonsense_device_ids_are_ignored(self):
        for bad in ['', 'short', 'x' * 200, '<script>']:
            cache.clear()
            self.signup(f'06610000{len(bad) % 90:02d}', device_id=bad)
        self.assertFalse(Device.objects.exists())

    def test_admin_shows_devices_with_more_than_3_accounts(self):
        for i in range(4):
            cache.clear()
            self.signup(f'066100000{i}')
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        browser = Client()
        browser.force_login(admin)
        page = browser.get('/admin/moderation/device/?accounts=suspicious')
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, 'suspicious (4 accounts)')


# 5. Suspend, reactivate, ban -----------------------------------------------------------

class SuspendAndBanTests(ModerationTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                                   display_name='Admin')
        self.listing = self.make_listing()

    def login(self, phone, password=PASSWORD):
        self.client.force_authenticate(None)
        return self.client.post('/api/auth/login/', {'phone_or_email': phone, 'password': password},
                                format='json')

    def public_titles(self):
        self.client.force_authenticate(None)
        return [r['title'] for r in self.client.get('/api/listings/').data['results']]

    def test_suspend_and_reactivate(self):
        actions.suspend_user(self.seller, self.admin)
        self.assertEqual(self.login('0550000001').data['code'], 'account_suspended')
        self.assertEqual(self.public_titles(), [])  # their listings are hidden
        actions.reactivate_user(self.seller, self.admin)
        self.assertEqual(self.login('0550000001').status_code, status.HTTP_200_OK)
        self.assertEqual(self.public_titles(), ['Robe kabyle'])
        self.assertEqual(list(ModerationLog.objects.values_list('action', flat=True)),
                         ['reactivate_user', 'suspend_user'])

    def test_ban_blocks_phone_and_devices_from_new_accounts(self):
        device = Device.objects.create(device_id='d' * 20)
        DeviceAccount.objects.create(device=device, user=self.seller)

        actions.ban_user(self.seller, self.admin, note='Scam reports')
        self.seller.refresh_from_db()
        self.assertFalse(self.seller.is_active)
        self.assertIsNotNone(self.seller.banned_at)
        self.assertTrue(BlockedPhone.objects.filter(phone='0550000001').exists())
        device.refresh_from_db()
        self.assertTrue(device.banned)
        self.assertEqual(self.login('0550000001').data['code'], 'account_banned')
        self.assertEqual(self.public_titles(), [])

        # The banned device can't create a new account...
        cache.clear()
        response = self.client.post('/api/auth/signup/', {
            'phone': '0661999999', 'password': PASSWORD, 'display_name': 'New', 'wilaya': 16,
            'device_id': 'd' * 20}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("isn't possible from this device", response.data['detail'][0])

        # ...and the blocked phone can't be verified on another account.
        newcomer = User.objects.create_user(email='new@example.com', display_name='New')
        self.client.force_authenticate(newcomer)
        response = self.client.post('/api/auth/phone/send-code/', {'phone': '0550000001'},
                                    format='json')
        self.assertEqual(response.data['code'], 'phone_taken')  # still on the banned account

        log = ModerationLog.objects.get(action='ban_user')
        self.assertEqual((log.actor, log.target_id, log.note), (self.admin, self.seller.id,
                                                               'Scam reports'))

    def test_blocked_phone_cannot_sign_up(self):
        BlockedPhone.objects.create(phone='0661888888', reason='test')
        cache.clear()
        response = self.client.post('/api/auth/signup/', {
            'phone': '0661888888', 'password': PASSWORD, 'display_name': 'X', 'wilaya': 16},
            format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['phone'][0],
                         "This phone number can't be used to create an account.")

    def test_banned_users_token_stops_working(self):
        token = self.login('0550000001').data['access']
        actions.ban_user(self.seller, self.admin)
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(self.client.get('/api/auth/me/').status_code, status.HTTP_401_UNAUTHORIZED)


# Admin tools ---------------------------------------------------------------------------

class AdminToolsTests(ModerationTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                                   display_name='Admin')
        self.browser = Client()
        self.browser.force_login(self.admin)
        self.flagged = self.make_listing(title='Suspicious robe',
                                         review_status=Listing.Review.PENDING,
                                         flag_reasons=[{'code': 'advance_payment',
                                                        'detail': 'Suspicious words: ccp'}])
        self.make_listing(title='Normal robe')

    def test_needs_review_list_shows_only_flagged_listings(self):
        page = self.browser.get('/admin/moderation/listingreview/')
        self.assertContains(page, 'Suspicious robe')
        self.assertNotContains(page, 'Normal robe')
        self.assertContains(page, 'Asks for payment in advance')

    def test_approve_and_reject_buttons(self):
        url = f'/admin/moderation/listingreview/{self.flagged.id}/change/'
        page = self.browser.get(url)
        self.assertContains(page, 'name="_approve"')
        self.assertContains(page, 'name="_reject"')

        response = self.browser.post(url, {'_approve': 'Approve'})
        self.assertEqual(response.status_code, 302)
        self.flagged.refresh_from_db()
        self.assertEqual(self.flagged.review_status, Listing.Review.APPROVED)
        self.assertEqual(self.flagged.reviewed_by, self.admin)

        other = self.make_listing(title='Another', review_status=Listing.Review.PENDING)
        self.browser.post(f'/admin/moderation/listingreview/{other.id}/change/',
                          {'_reject': 'Reject'})
        other.refresh_from_db()
        self.assertEqual(other.review_status, Listing.Review.REJECTED)
        self.assertEqual(sorted(ModerationLog.objects.values_list('action', flat=True)),
                         ['approve_listing', 'reject_listing'])

    def test_bulk_approve_action(self):
        second = self.make_listing(title='Second', review_status=Listing.Review.PENDING)
        self.browser.post('/admin/moderation/listingreview/', {
            'action': 'approve_selected', '_selected_action': [self.flagged.id, second.id]})
        self.assertEqual(Listing.objects.filter(review_status=Listing.Review.PENDING).count(), 0)

    def test_ban_from_the_users_list(self):
        self.browser.post('/admin/accounts/user/', {
            'action': 'ban_users', '_selected_action': [self.other.id, self.admin.id]})
        self.other.refresh_from_db()
        self.admin.refresh_from_db()
        self.assertIsNotNone(self.other.banned_at)
        self.assertTrue(self.admin.is_active)  # an admin can't ban themselves

    def test_admin_pages_open(self):
        for url in ['/admin/moderation/listingreview/', '/admin/moderation/flaggedkeyword/',
                    '/admin/moderation/device/', '/admin/moderation/blockedphone/',
                    '/admin/moderation/moderationlog/', '/admin/accounts/user/',
                    '/admin/listings/listing/?review_status__exact=pending_review']:
            self.assertEqual(self.browser.get(url).status_code, 200, url)

    def test_starter_word_list_is_there(self):
        phrases = set(FlaggedKeyword.objects.values_list('phrase', flat=True))
        for word in ['versement', 'avance', 'ccp', 'baridimob', 'تحويل', 'دفع مسبق']:
            self.assertIn(word, phrases)
        self.assertEqual(
            set(FlaggedKeyword.objects.values_list('language', flat=True)),
            {'fr', 'ar', 'en', 'darija'})

    def test_hidden_listings_disappear_from_favorites(self):
        Favorite.objects.create(user=self.other, listing=self.flagged)
        Favorite.objects.create(user=self.other, listing=Listing.objects.get(title='Normal robe'))
        self.client.force_authenticate(self.other)
        titles = [f['listing']['title'] for f in self.client.get('/api/favorites/').data['results']]
        self.assertEqual(titles, ['Normal robe'])

    def test_blocked_phone_cannot_be_verified(self):
        BlockedPhone.objects.create(phone='0661888888', reason='test')
        newcomer = User.objects.create_user(email='new@example.com', display_name='New')
        self.client.force_authenticate(newcomer)
        response = self.client.post('/api/auth/phone/send-code/', {'phone': '0661888888'},
                                    format='json')
        self.assertEqual(response.data['code'], 'phone_blocked')
