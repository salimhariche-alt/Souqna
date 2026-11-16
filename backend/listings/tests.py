"""Tests for the /api/ endpoints. Run with:  python manage.py test"""

import os
import shutil
import tempfile
from datetime import timedelta
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from souqna_api.wilayas import Wilaya

from .models import Category, Favorite, Listing, ListingPhoto

User = get_user_model()
TEMP_MEDIA = tempfile.mkdtemp(prefix='souqna-test-media-')


def make_image(name='photo.jpg'):
    buffer = BytesIO()
    Image.new('RGB', (50, 50), 'red').save(buffer, format='JPEG')
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='image/jpeg')


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class ApiTestCase(APITestCase):
    """Shared test data: two users, categories and a helper to make listings."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    @classmethod
    def setUpTestData(cls):
        # Verified phones: posting and messaging need one (tested in accounts/tests.py).
        cls.seller = User.objects.create_user(phone='0550000001', display_name='Amina',
                                              wilaya=Wilaya.ALGER, phone_verified=True)
        cls.other = User.objects.create_user(phone='0660000002', display_name='Yacine',
                                             wilaya=Wilaya.ORAN, phone_verified=True)
        cls.women = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')
        cls.men = Category.objects.create(name_en='Men', name_fr='Hommes', name_ar='رجال')
        cls.dresses = Category.objects.create(name_en='Dresses', name_fr='Robes',
                                              name_ar='فساتين', parent=cls.women)

    def make_listing(self, **kwargs):
        data = dict(seller=self.seller, title='Robe kabyle', description='Belle robe',
                    price_dzd=5000, category=self.women, size='M', brand='',
                    condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER)
        data.update(kwargs)
        return Listing.objects.create(**data)

    def assertNotLoggedIn(self, response):
        """Blocked because nobody is logged in (not because of the owner rule)."""
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['detail'].code, 'not_authenticated')

    def assertNotOwner(self, response):
        """Logged in, but blocked because this isn't your listing."""
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'].code, 'permission_denied')

    def list_ids(self, query=''):
        response = self.client.get('/api/listings/' + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return [item['id'] for item in response.data['results']]


# 6. Categories ---------------------------------------------------------------

class CategoryTests(ApiTestCase):
    def test_anyone_can_list_categories_in_three_languages(self):
        response = self.client.get('/api/categories/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)  # not paginated: a plain list
        women = next(c for c in response.data if c['id'] == self.women.id)
        self.assertEqual((women['name_ar'], women['name_fr'], women['name_en']),
                         ('نساء', 'Femmes', 'Women'))
        dresses = next(c for c in response.data if c['id'] == self.dresses.id)
        self.assertEqual(dresses['parent'], self.women.id)

    def test_categories_are_read_only(self):
        self.client.force_authenticate(self.seller)
        response = self.client.post('/api/categories/', {'name_en': 'X'})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


# 1. Listing list, filters and search -----------------------------------------

class ListingListTests(ApiTestCase):
    def test_anyone_can_list_and_only_active_listings_are_shown(self):
        active = self.make_listing()
        self.make_listing(status=Listing.Status.RESERVED)
        self.make_listing(status=Listing.Status.SOLD)
        self.assertEqual(self.list_ids(), [active.id])

    def test_newest_first(self):
        old = self.make_listing(title='Old')
        new = self.make_listing(title='New')
        Listing.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=3))
        self.assertEqual(self.list_ids(), [new.id, old.id])

    def test_20_per_page(self):
        for i in range(25):
            self.make_listing(title=f'Item {i}')
        page1 = self.client.get('/api/listings/').data
        self.assertEqual(page1['count'], 25)
        self.assertEqual(len(page1['results']), 20)
        self.assertIsNotNone(page1['next'])
        page2 = self.client.get('/api/listings/?page=2').data
        self.assertEqual(len(page2['results']), 5)

    def test_list_item_shows_summary_and_cover_photo(self):
        listing = self.make_listing()
        ListingPhoto.objects.create(listing=listing, position=2, image='listings/b.jpg')
        ListingPhoto.objects.create(listing=listing, position=1, image='listings/a.jpg')
        item = self.client.get('/api/listings/').data['results'][0]
        self.assertEqual(item['category_name'], 'Women')
        self.assertEqual(item['wilaya_name'], '16 - Alger')
        self.assertEqual(item['condition_label'], 'Good')
        self.assertTrue(item['cover_photo'].endswith('/media/listings/a.jpg'))
        self.assertNotIn('description', item)

    def test_filter_by_category_includes_subcategories(self):
        dress = self.make_listing(category=self.dresses)
        women = self.make_listing(category=self.women)
        self.make_listing(category=self.men)
        self.assertCountEqual(self.list_ids(f'?category={self.women.id}'), [dress.id, women.id])
        self.assertEqual(self.list_ids(f'?category={self.dresses.id}'), [dress.id])

    def test_filter_by_wilaya(self):
        oran = self.make_listing(wilaya=Wilaya.ORAN)
        self.make_listing(wilaya=Wilaya.ALGER)
        self.assertEqual(self.list_ids('?wilaya=31'), [oran.id])

    def test_invalid_wilaya_is_rejected(self):
        response = self.client.get('/api/listings/?wilaya=99')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filter_by_price_range(self):
        self.make_listing(price_dzd=1000)
        mid = self.make_listing(price_dzd=5000)
        self.make_listing(price_dzd=9000)
        self.assertEqual(self.list_ids('?min_price=2000&max_price=6000'), [mid.id])
        self.assertEqual(len(self.list_ids('?min_price=5000')), 2)
        self.assertEqual(len(self.list_ids('?max_price=5000')), 2)

    def test_filter_by_size_ignores_case(self):
        large = self.make_listing(size='L')
        self.make_listing(size='M')
        self.assertEqual(self.list_ids('?size=l'), [large.id])

    def test_filter_by_condition(self):
        new = self.make_listing(condition=Listing.Condition.NEW_WITH_TAGS)
        self.make_listing(condition=Listing.Condition.GOOD)
        self.assertEqual(self.list_ids('?condition=new_with_tags'), [new.id])

    def test_search_title_description_and_brand(self):
        by_title = self.make_listing(title='Caftan brodé')
        by_desc = self.make_listing(title='Robe', description='Style caftan moderne')
        by_brand = self.make_listing(title='Baskets', brand='Nike')
        self.make_listing(title='Something else')
        self.assertCountEqual(self.list_ids('?search=caftan'), [by_title.id, by_desc.id])
        self.assertEqual(self.list_ids('?search=nike'), [by_brand.id])

    def test_filters_combine(self):
        match = self.make_listing(wilaya=Wilaya.ORAN, price_dzd=3000, brand='Zara')
        self.make_listing(wilaya=Wilaya.ORAN, price_dzd=30000, brand='Zara')
        self.make_listing(wilaya=Wilaya.ALGER, price_dzd=3000, brand='Zara')
        self.assertEqual(self.list_ids('?wilaya=31&max_price=5000&search=zara'), [match.id])


# 2. Listing detail ----------------------------------------------------------

class ListingDetailTests(ApiTestCase):
    def test_anyone_sees_full_details_with_photos_and_seller_name(self):
        listing = self.make_listing(description='Robe faite main')
        ListingPhoto.objects.create(listing=listing, position=1, image='listings/a.jpg')
        response = self.client.get(f'/api/listings/{listing.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['description'], 'Robe faite main')
        seller = response.data['seller']
        self.assertEqual(
            {k: seller[k] for k in ('id', 'display_name', 'wilaya', 'phone_verified', 'items_sold')},
            {'id': self.seller.id, 'display_name': 'Amina', 'wilaya': Wilaya.ALGER,
             'phone_verified': True, 'items_sold': 0})
        self.assertTrue(seller['member_since'].startswith(str(self.seller.date_joined.year)))
        self.assertEqual(len(response.data['photos']), 1)
        self.assertEqual(response.data['photos'][0]['position'], 1)
        self.assertNotIn('phone', response.data['seller'])  # don't leak phone numbers
        self.assertNotIn('email', response.data['seller'])

    def test_seller_without_wilaya(self):
        no_wilaya = User.objects.create_user(phone='0770000009', display_name='Sans wilaya')
        listing = self.make_listing(seller=no_wilaya)
        response = self.client.get(f'/api/listings/{listing.id}/')
        self.assertIsNone(response.data['seller']['wilaya'])

    def test_is_favorited_is_false_for_visitors(self):
        listing = self.make_listing()
        Favorite.objects.create(user=self.other, listing=listing)
        response = self.client.get(f'/api/listings/{listing.id}/')
        self.assertIs(response.data['is_favorited'], False)

    def test_is_favorited_follows_my_favorites(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.other)
        self.assertIs(self.client.get(f'/api/listings/{listing.id}/').data['is_favorited'], False)
        self.client.post(f'/api/listings/{listing.id}/favorite/')
        self.assertIs(self.client.get(f'/api/listings/{listing.id}/').data['is_favorited'], True)
        # Someone else's favorite doesn't count for me.
        self.client.force_authenticate(self.seller)
        self.assertIs(self.client.get(f'/api/listings/{listing.id}/').data['is_favorited'], False)

    def test_sold_listing_detail_still_viewable(self):
        listing = self.make_listing(status=Listing.Status.SOLD)
        response = self.client.get(f'/api/listings/{listing.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'sold')

    def test_unknown_listing_returns_404(self):
        self.assertEqual(self.client.get('/api/listings/99999/').status_code,
                         status.HTTP_404_NOT_FOUND)


# 3. Create, edit, mark reserved / sold -----------------------------------------

class ListingWriteTests(ApiTestCase):
    def new_listing_data(self, **kwargs):
        data = {'title': 'Veste en cuir', 'description': 'Taille XL', 'price_dzd': 9500,
                'category': self.men.id, 'size': 'XL', 'brand': '',
                'condition': 'very_good', 'wilaya': 31}
        data.update(kwargs)
        return data

    def test_must_be_logged_in_to_create(self):
        response = self.client.post('/api/listings/', self.new_listing_data())
        self.assertNotLoggedIn(response)
        self.assertFalse(Listing.objects.exists())

    def test_logged_in_user_can_create_and_becomes_seller(self):
        self.client.force_authenticate(self.other)
        response = self.client.post('/api/listings/', self.new_listing_data(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        listing = Listing.objects.get(pk=response.data['id'])
        self.assertEqual(listing.seller, self.other)
        self.assertEqual(listing.status, Listing.Status.ACTIVE)
        self.assertEqual(response.data['seller']['display_name'], 'Yacine')

    def test_create_ignores_status_and_seller_sent_by_client(self):
        self.client.force_authenticate(self.other)
        data = self.new_listing_data(status='sold', seller=self.seller.id)
        response = self.client.post('/api/listings/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        listing = Listing.objects.get(pk=response.data['id'])
        self.assertEqual(listing.status, Listing.Status.ACTIVE)
        self.assertEqual(listing.seller, self.other)

    def test_create_validates_fields(self):
        self.client.force_authenticate(self.other)
        data = self.new_listing_data(title='', condition='broken', wilaya=99, category=99999)
        response = self.client.post('/api/listings/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for field in ['title', 'condition', 'wilaya', 'category']:
            self.assertIn(field, response.data)

    def test_owner_can_edit(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.seller)
        response = self.client.patch(f'/api/listings/{listing.id}/',
                                     {'price_dzd': 4000, 'title': 'Robe kabyle (prix baissé)'},
                                     format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        listing.refresh_from_db()
        self.assertEqual((listing.price_dzd, listing.title), (4000, 'Robe kabyle (prix baissé)'))

    def test_other_user_cannot_edit(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.other)
        response = self.client.patch(f'/api/listings/{listing.id}/', {'price_dzd': 1},
                                     format='json')
        self.assertNotOwner(response)
        listing.refresh_from_db()
        self.assertEqual(listing.price_dzd, 5000)

    def test_anonymous_cannot_edit(self):
        listing = self.make_listing()
        response = self.client.patch(f'/api/listings/{listing.id}/', {'price_dzd': 1},
                                     format='json')
        self.assertNotLoggedIn(response)

    def test_owner_can_mark_reserved_then_sold(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.seller)
        for new_status in ['reserved', 'sold']:
            response = self.client.patch(f'/api/listings/{listing.id}/',
                                         {'status': new_status}, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            listing.refresh_from_db()
            self.assertEqual(listing.status, new_status)
        self.client.force_authenticate(None)
        self.assertEqual(self.list_ids(), [])  # sold items leave the public list

    def test_other_user_cannot_mark_sold(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.other)
        response = self.client.patch(f'/api/listings/{listing.id}/', {'status': 'sold'},
                                     format='json')
        self.assertNotOwner(response)
        listing.refresh_from_db()
        self.assertEqual(listing.status, Listing.Status.ACTIVE)

    def test_invalid_status_rejected(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.seller)
        response = self.client.patch(f'/api/listings/{listing.id}/', {'status': 'stolen'},
                                     format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_seller_deletes_a_listing_it_is_hidden_not_erased(self):
        listing = self.make_listing()
        Favorite.objects.create(user=self.other, listing=listing)
        self.client.force_authenticate(self.other)
        self.assertNotOwner(self.client.delete(f'/api/listings/{listing.id}/'))
        self.client.force_authenticate(self.seller)
        response = self.client.delete(f'/api/listings/{listing.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        listing.refresh_from_db()
        self.assertIsNotNone(listing.deleted_at)  # still in the database
        self.assertFalse(Favorite.objects.filter(listing=listing).exists())
        # Gone for everyone, the seller included.
        self.assertEqual(self.client.get(f'/api/listings/{listing.id}/').status_code, 404)
        self.client.force_authenticate(None)
        self.assertNotIn(listing.id, self.list_ids())


# 4. Photo upload -----------------------------------------------------------------

class PhotoUploadTests(ApiTestCase):
    def upload(self, listing, image=None):
        return self.client.post(f'/api/listings/{listing.id}/photos/',
                                {'image': image or make_image()}, format='multipart')

    def test_owner_uploads_photos_in_order(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.seller)
        first = self.upload(listing)
        second = self.upload(listing)
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual((first.data['position'], second.data['position']), (1, 2))
        self.assertTrue(first.data['image'].startswith('http://testserver/media/listings/'))
        self.assertEqual(listing.photos.count(), 2)

    def test_upload_fills_a_freed_slot(self):
        listing = self.make_listing()
        ListingPhoto.objects.create(listing=listing, position=1, image='a.jpg')
        ListingPhoto.objects.create(listing=listing, position=3, image='c.jpg')
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.upload(listing).data['position'], 2)

    def test_maximum_8_photos(self):
        listing = self.make_listing()
        for position in range(1, 9):
            ListingPhoto.objects.create(listing=listing, position=position, image=f'{position}.jpg')
        self.client.force_authenticate(self.seller)
        response = self.upload(listing)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('at most 8', response.data['detail'])
        self.assertEqual(listing.photos.count(), 8)

    def test_other_user_cannot_upload(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.other)
        self.assertNotOwner(self.upload(listing))
        self.assertEqual(listing.photos.count(), 0)

    def test_anonymous_cannot_upload(self):
        listing = self.make_listing()
        self.assertNotLoggedIn(self.upload(listing))
        self.assertEqual(listing.photos.count(), 0)

    def test_non_image_file_rejected(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.seller)
        fake = SimpleUploadedFile('virus.jpg', b'not really an image', content_type='image/jpeg')
        response = self.upload(listing, image=fake)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('image', response.data)

    def test_missing_file_rejected(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.seller)
        response = self.client.post(f'/api/listings/{listing.id}/photos/', {},
                                    format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PhotoEditTests(ApiTestCase):
    """Removing photos and choosing the cover (used by the app's Edit screen)."""

    def setUp(self):
        self.listing = self.make_listing()
        self.client.force_authenticate(self.seller)
        self.ids = [self.client.post(f'/api/listings/{self.listing.id}/photos/',
                                     {'image': make_image(f'{n}.jpg')},
                                     format='multipart').data['id'] for n in range(3)]

    def test_delete_a_photo_and_its_file(self):
        photo = ListingPhoto.objects.get(pk=self.ids[1])
        path = photo.image.path
        response = self.client.delete(f'/api/listings/{self.listing.id}/photos/{self.ids[1]}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.listing.photos.count(), 2)
        self.assertFalse(os.path.exists(path))

    def test_delete_unknown_photo(self):
        response = self.client.delete(f'/api/listings/{self.listing.id}/photos/999999/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_only_the_seller_can_delete_or_reorder(self):
        self.client.force_authenticate(self.other)
        self.assertNotOwner(
            self.client.delete(f'/api/listings/{self.listing.id}/photos/{self.ids[0]}/'))
        self.assertNotOwner(self.client.post(f'/api/listings/{self.listing.id}/photos/order/',
                                             {'order': self.ids[::-1]}, format='json'))
        self.assertEqual(self.listing.photos.count(), 3)

    def test_move_a_photo_to_be_the_cover(self):
        images = dict(ListingPhoto.objects.values_list('pk', 'image'))
        order = [self.ids[2], self.ids[0], self.ids[1]]
        response = self.client.post(f'/api/listings/{self.listing.id}/photos/order/',
                                    {'order': order}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([p['position'] for p in response.data], [1, 2, 3])
        saved = list(self.listing.photos.order_by('position').values_list('image', flat=True))
        self.assertEqual(saved, [images[i] for i in order])  # same files, new order

    def test_order_with_8_photos(self):
        for n in range(5):
            self.client.post(f'/api/listings/{self.listing.id}/photos/',
                             {'image': make_image()}, format='multipart')
        ids = list(self.listing.photos.order_by('position').values_list('pk', flat=True))
        self.assertEqual(len(ids), 8)
        response = self.client.post(f'/api/listings/{self.listing.id}/photos/order/',
                                    {'order': ids[::-1]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_order_must_list_every_photo_once(self):
        url = f'/api/listings/{self.listing.id}/photos/order/'
        for bad in ([self.ids[0]], self.ids + [self.ids[0]], [*self.ids[:2], 999999], 'abc'):
            response = self.client.post(url, {'order': bad}, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
        self.assertEqual(self.listing.photos.count(), 3)


# 5. Favorites ----------------------------------------------------------------------

class FavoriteTests(ApiTestCase):
    def test_must_be_logged_in(self):
        listing = self.make_listing()
        self.assertNotLoggedIn(self.client.post(f'/api/listings/{listing.id}/favorite/'))
        self.assertNotLoggedIn(self.client.delete(f'/api/listings/{listing.id}/favorite/'))
        self.assertNotLoggedIn(self.client.get('/api/favorites/'))
        self.assertFalse(Favorite.objects.exists())

    def test_add_favorite_once(self):
        listing = self.make_listing()
        self.client.force_authenticate(self.other)
        first = self.client.post(f'/api/listings/{listing.id}/favorite/')
        again = self.client.post(f'/api/listings/{listing.id}/favorite/')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(Favorite.objects.filter(user=self.other).count(), 1)

    def test_remove_favorite(self):
        listing = self.make_listing()
        Favorite.objects.create(user=self.other, listing=listing)
        self.client.force_authenticate(self.other)
        response = self.client.delete(f'/api/listings/{listing.id}/favorite/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Favorite.objects.exists())
        again = self.client.delete(f'/api/listings/{listing.id}/favorite/')
        self.assertEqual(again.status_code, status.HTTP_404_NOT_FOUND)

    def test_favorite_unknown_listing_returns_404(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post('/api/listings/99999/favorite/').status_code,
                         status.HTTP_404_NOT_FOUND)

    def test_my_favorites_list_shows_only_mine_newest_first(self):
        first = self.make_listing(title='First')
        second = self.make_listing(title='Second')
        mine_old = Favorite.objects.create(user=self.other, listing=first)
        Favorite.objects.filter(pk=mine_old.pk).update(created_at=timezone.now() - timedelta(days=1))
        Favorite.objects.create(user=self.other, listing=second)
        Favorite.objects.create(user=self.seller, listing=first)  # someone else's

        self.client.force_authenticate(self.other)
        response = self.client.get('/api/favorites/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        titles = [fav['listing']['title'] for fav in response.data['results']]
        self.assertEqual(titles, ['Second', 'First'])
