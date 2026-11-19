"""Tests for push notifications (Step 5.1 I). Run with:  python manage.py test push"""

from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from delivery.models import Order
from listings.models import Category, Listing
from messaging.models import Conversation, Message
from souqna_api.wilayas import Wilaya

from .backends import MemoryBackend
from .models import PushDevice, PushSettings

TOKEN_SELLER = 'ExponentPushToken[seller-aaaaaaaaaaaa]'
TOKEN_BUYER = 'ExponentPushToken[buyer-bbbbbbbbbbbbb]'


@override_settings(PUSH_BACKEND='push.backends.MemoryBackend',
                   DELIVERY_PROVIDER='delivery.providers.fake.FakeProvider')
class PushTests(APITestCase):
    def setUp(self):
        MemoryBackend.outbox = []
        cache.clear()
        self.seller = User.objects.create_user(phone='0661000201', display_name='Amina',
                                               wilaya=Wilaya.ORAN, phone_verified=True,
                                               preferred_language='fr')
        self.buyer = User.objects.create_user(phone='0771000202', display_name='Yacine',
                                              wilaya=Wilaya.ALGER, phone_verified=True,
                                              preferred_language='ar')
        category = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')
        self.listing = Listing.objects.create(seller=self.seller, title='Veste en jean',
                                              price_dzd=3500, category=category,
                                              condition=Listing.Condition.GOOD, wilaya=Wilaya.ORAN)
        self.conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                        seller=self.seller)
        PushDevice.objects.create(user=self.seller, token=TOKEN_SELLER, platform='android')
        PushDevice.objects.create(user=self.buyer, token=TOKEN_BUYER, platform='android')

    def sent_to(self, token):
        return [m for m in MemoryBackend.outbox if m['to'] == token]

    def order(self):
        self.client.force_authenticate(self.buyer)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/orders/', {
                'listing': self.listing.pk, 'wilaya': 16, 'relay_point': 'FAKE-ALG-01',
                'recipient_name': 'Yacine', 'recipient_phone': '0771000202'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return Order.objects.get(pk=response.data['id'])

    def message(self, sender, text='Bonjour'):
        with self.captureOnCommitCallbacks(execute=True):
            Message.objects.create(conversation=self.conversation, sender=sender, text=text)

    # Phones and settings -----------------------------------------------------------

    def test_register_and_forget_a_phone(self):
        self.client.force_authenticate(self.buyer)
        token = 'ExponentPushToken[new-phone-cccccc]'
        response = self.client.post('/api/push/devices/', {'token': token, 'platform': 'android'})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(PushDevice.objects.get(token=token).user, self.buyer)
        # Someone else logs in on the same phone: it becomes theirs.
        self.client.force_authenticate(self.seller)
        self.client.post('/api/push/devices/', {'token': token})
        self.assertEqual(PushDevice.objects.get(token=token).user, self.seller)
        response = self.client.delete('/api/push/devices/', {'token': token}, format='json')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(PushDevice.objects.filter(token=token).exists())
        self.assertEqual(self.client.post('/api/push/devices/', {'token': 'hello'}).status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post('/api/push/devices/', {'token': token}).status_code, 401)

    def test_settings(self):
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get('/api/push/settings/').data, {'orders': True, 'messages': True})
        data = self.client.patch('/api/push/settings/', {'messages': False}, format='json').data
        self.assertEqual(data, {'orders': True, 'messages': False})

    # Orders --------------------------------------------------------------------------

    def test_new_order_alerts_the_seller_in_their_language(self):
        order = self.order()
        [alert] = self.sent_to(TOKEN_SELLER)
        self.assertEqual(alert['title'], 'Nouvelle commande !')
        self.assertIn('Veste en jean', alert['body'])
        self.assertEqual(alert['data'], {'url': f'/order/{order.pk}'})
        self.assertEqual(self.sent_to(TOKEN_BUYER), [])  # the buyer just ordered

    def test_confirmation_alerts_the_buyer_in_arabic(self):
        order = self.order()
        self.client.force_authenticate(self.seller)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/orders/{order.pk}/confirm/', {'drop_off_point': 'FAKE-ORN-01'})
        [alert] = self.sent_to(TOKEN_BUYER)
        self.assertEqual(alert['title'], 'تم تأكيد الطلب')

    def test_no_order_alerts_when_turned_off(self):
        PushSettings.objects.create(user=self.seller, orders=False)
        self.order()
        self.assertEqual(MemoryBackend.outbox, [])

    def test_whoever_cancels_is_not_alerted(self):
        order = self.order()
        MemoryBackend.outbox = []
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/orders/{order.pk}/cancel/')  # the buyer
        self.assertEqual(len(self.sent_to(TOKEN_SELLER)), 1)
        self.assertEqual(self.sent_to(TOKEN_BUYER), [])

    # Messages and offers ---------------------------------------------------------------

    def test_message_alert_without_the_words_and_once_a_minute(self):
        self.message(self.buyer, 'Mon numéro secret est 0550 00 00 00')
        self.message(self.buyer, 'Encore un message')
        [alert] = self.sent_to(TOKEN_SELLER)
        self.assertEqual(alert['title'], 'Yacine')
        self.assertNotIn('secret', alert['body'])
        self.assertEqual(alert['data'], {'url': f'/chat/{self.conversation.pk}'})

    def test_offers_alert(self):
        self.client.force_authenticate(self.buyer)
        with self.captureOnCommitCallbacks(execute=True):
            offer = self.client.post('/api/offers/', {'conversation': self.conversation.pk,
                                                      'amount_dzd': 3000}).data['offer']
        [alert] = self.sent_to(TOKEN_SELLER)
        self.assertEqual(alert['title'], 'Yacine fait une offre')
        self.assertIn('3 000 DA', alert['body'])
        self.client.force_authenticate(self.seller)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/offers/{offer["id"]}/accept/')
        [alert] = self.sent_to(TOKEN_BUYER)
        self.assertEqual(alert['title'], 'تم قبول العرض!')

    def test_no_message_alerts_when_turned_off(self):
        PushSettings.objects.create(user=self.seller, messages=False)
        self.message(self.buyer)
        self.assertEqual(MemoryBackend.outbox, [])

    # Phones that are gone ---------------------------------------------------------------

    def test_gone_phones_are_forgotten(self):
        with mock.patch.object(MemoryBackend, 'send', return_value=[TOKEN_SELLER]):
            self.message(self.buyer)
        self.assertFalse(PushDevice.objects.filter(token=TOKEN_SELLER).exists())

    def test_a_failing_push_service_breaks_nothing(self):
        failing = mock.patch.object(MemoryBackend, 'send', side_effect=OSError('down'))
        with failing, self.assertLogs('push.service', level='ERROR'):
            self.order()  # still created
        self.assertTrue(Order.objects.exists())

    def test_deleted_account_has_no_more_phones(self):
        from accounts.deletion import delete_account
        delete_account(self.buyer)
        self.assertFalse(PushDevice.objects.filter(user=self.buyer).exists())
