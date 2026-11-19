"""Tests for delivery between wilayas (Step 5.1).

Run with:  python manage.py test
"""

from datetime import timedelta
from unittest import mock

from django.core.management import call_command
from django.test import Client, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from listings.models import Category, Listing
from messaging.models import Conversation
from souqna_api.wilayas import Wilaya

from . import services
from .models import Commune, Notification, Offer, Order
from .providers import ProviderError, get_provider
from .providers.fake import FakeProvider

ORDERS = '/api/orders/'
RELAY = '/api/delivery/relay-points/'
ESTIMATE = '/api/delivery/estimate/'
PASSWORD = 'Sougna-2026!'


@override_settings(DELIVERY_PROVIDER='delivery.providers.fake.FakeProvider',
                   DELIVERY_FAKE_STEP_MINUTES=2, SOUGNA_BUYER_FEE_PERCENT=5,
                   SOUGNA_BUYER_FEE_MIN_DZD=50, SOUGNA_SAME_WILAYA_DROP_OFF=True,
                   SOUGNA_SAME_WILAYA_EXTRA_FEE_DZD=150, SOUGNA_RELAY_HANDLING_DZD=150,
                   SOUGNA_CONFIRM_HOURS=24, SOUGNA_OFFER_MIN_PERCENT=50, SOUGNA_OFFER_HOURS=48)
class DeliveryTestCase(APITestCase):
    def setUp(self):
        self.seller = User.objects.create_user(phone='0661000101', display_name='Amina',
                                               wilaya=Wilaya.ORAN, phone_verified=True)
        self.buyer = User.objects.create_user(phone='0771000102', display_name='Yacine',
                                              wilaya=Wilaya.ALGER, phone_verified=True)
        self.stranger = User.objects.create_user(phone='0551000103', display_name='Other',
                                                 phone_verified=True)
        category = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')
        self.listing = Listing.objects.create(seller=self.seller, title='Veste en jean',
                                              price_dzd=3500, category=category,
                                              condition=Listing.Condition.VERY_GOOD,
                                              wilaya=Wilaya.ORAN)
        self.conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                        seller=self.seller)
        self.alger_centre = Commune.objects.get(code=1601)

    def order_data(self, **extra):
        # The buyer collects at the Alger Centre relay point of the fake company.
        data = {'listing': self.listing.pk, 'wilaya': 16, 'relay_point': 'FAKE-ALG-01',
                'recipient_name': 'Yacine', 'recipient_phone': '0771 00 01 02'}
        data.update(extra)
        return data

    def create_order(self, **extra):
        self.client.force_authenticate(self.buyer)
        response = self.client.post(ORDERS, self.order_data(**extra), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return Order.objects.get(pk=response.data['id'])

    def confirm(self, order, point='FAKE-ORN-01', expect=200):
        """The seller confirms, dropping the parcel at an Oran office."""
        self.client.force_authenticate(self.seller)
        response = self.client.post(f'{ORDERS}{order.pk}/confirm/', {'drop_off_point': point},
                                    format='json')
        self.assertEqual(response.status_code, expect, response.data)
        order.refresh_from_db()
        return order

    def age(self, order, minutes):
        """Pretend the seller confirmed `minutes` ago (the fake company moves with time)."""
        start = timezone.now() - timedelta(minutes=minutes)
        Order.objects.filter(pk=order.pk).update(confirmed_at=start, last_synced_at=None)
        order.events.filter(status__in=[Order.Status.CREATED, Order.Status.CONFIRMED]).update(
            created_at=start - timedelta(seconds=1))
        order.refresh_from_db()
        return order


# Data ---------------------------------------------------------------------------------

class CommuneDataTests(DeliveryTestCase):
    def test_all_communes_of_the_58_wilayas(self):
        self.assertEqual(Commune.objects.count(), 1541)
        self.assertEqual(sorted(set(Commune.objects.values_list('wilaya', flat=True))),
                         list(range(1, 59)))
        self.assertEqual(Commune.objects.filter(name_ar='').count(), 0)

    def test_new_wilayas_have_their_official_number_of_communes(self):
        official = {49: 10, 50: 2, 51: 6, 52: 10, 53: 3, 54: 2, 55: 13, 56: 2, 57: 8, 58: 3}
        for wilaya, count in official.items():
            self.assertEqual(Commune.objects.filter(wilaya=wilaya).count(), count, wilaya)

    def test_communes_api(self):
        response = self.client.get('/api/communes/?wilaya=16')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [c['name_fr'] for c in response.data]
        self.assertIn('Alger Centre', names)
        self.assertTrue(all(c['wilaya'] == 16 for c in response.data))
        self.assertEqual(self.client.get('/api/communes/?wilaya=abc').status_code, 400)


# The fake company and the fee ----------------------------------------------------------

class ProviderTests(DeliveryTestCase):
    def test_get_provider_is_the_fake_one(self):
        self.assertIsInstance(get_provider(), FakeProvider)

    def test_prices(self):
        fake = FakeProvider()
        same = fake.quote(origin_wilaya=16, wilaya=16, commune_code=1601, mode='home')
        north = fake.quote(origin_wilaya=31, wilaya=16, commune_code=1601, mode='home')
        south = fake.quote(origin_wilaya=16, wilaya=11, commune_code=1101, mode='home')
        desk = fake.quote(origin_wilaya=31, wilaya=16, commune_code=1601, mode='stop_desk')
        self.assertEqual((same.price_dzd, north.price_dzd, south.price_dzd), (400, 600, 900))
        self.assertEqual(desk.price_dzd, 400)
        self.assertTrue(desk.stop_desk_name)
        self.assertLess(north.days_max, south.days_max)

    def test_buyer_fee(self):
        self.assertEqual(services.buyer_fee(3500), 180)  # 5% = 175 -> rounded to 10 DA
        self.assertEqual(services.buyer_fee(400), 50)    # the minimum


# Creating an order ----------------------------------------------------------------------

class ParcelSizePriceTests(DeliveryTestCase):
    def test_bigger_parcels_cost_more(self):
        prices = [FakeProvider().quote(origin_wilaya=31, wilaya=16, commune_code=1601, mode='home',
                                       parcel_size=size).price_dzd
                  for size in ('small', 'medium', 'large')]
        self.assertEqual(prices, [600, 800, 1100])


class EstimateTests(DeliveryTestCase):
    """The listing page: delivery price to a wilaya, at the courier's office."""

    def test_anyone_gets_the_estimate(self):
        # Oran -> Alger, small parcel: 600 - 200 (office pick-up) = 400 DA.
        response = self.client.get(ESTIMATE, {'listing': self.listing.pk, 'wilaya': 16})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['delivery_price_dzd'], 400)
        self.assertEqual(response.data['item_price_dzd'], 3500)
        self.assertEqual(response.data['buyer_fee_dzd'], 180)
        self.assertEqual(response.data['total_dzd'], 3500 + 400 + 180)
        self.assertEqual((response.data['days_min'], response.data['days_max']), (2, 3))
        self.assertEqual(response.data['wilaya'], 16)

    def test_size_and_distance_change_the_price(self):
        self.listing.parcel_size = 'large'
        self.listing.save()
        north = self.client.get(ESTIMATE, {'listing': self.listing.pk, 'wilaya': 16}).data
        south = self.client.get(ESTIMATE, {'listing': self.listing.pk, 'wilaya': 11}).data
        self.assertEqual(north['delivery_price_dzd'], 400 + 500)
        self.assertEqual(south['delivery_price_dzd'], 700 + 500)
        self.assertFalse(north['same_wilaya'])

    def test_same_wilaya_is_free_and_the_office_is_paid_from_our_fee(self):
        # Seller in Oran, buyer in Oran: drop-off and pick-up at the same office.
        same = self.client.get(ESTIMATE, {'listing': self.listing.pk, 'wilaya': 31}).data
        self.assertTrue(same['same_wilaya'])
        self.assertEqual(same['delivery_price_dzd'], 0)
        self.assertEqual(same['buyer_fee_dzd'], 180 + 150)
        self.assertEqual(same['total_dzd'], 3500 + 330)
        self.assertEqual((same['days_min'], same['days_max']), (1, 2))
        self.assertNotIn('relay_handling_dzd', same)  # our cost: not shown to buyers

    def test_same_wilaya_rule_can_be_turned_off(self):
        with self.settings(SOUGNA_SAME_WILAYA_DROP_OFF=False):
            same = self.client.get(ESTIMATE, {'listing': self.listing.pk, 'wilaya': 31}).data
        self.assertEqual((same['delivery_price_dzd'], same['buyer_fee_dzd']), (250, 180))

    def test_orders_record_the_same_amounts(self):
        self.listing.parcel_size = 'medium'
        self.listing.save()
        order = self.create_order()
        self.assertEqual(order.delivery_price_dzd, 400 + 200)  # medium parcel
        self.assertEqual(order.relay_handling_dzd, 0)
        self.listing.wilaya = Wilaya.ALGER
        self.listing.status = Listing.Status.ACTIVE
        self.listing.save()
        order.status = Order.Status.CANCELLED
        order.save()
        same = self.create_order()
        self.assertEqual((same.delivery_price_dzd, same.buyer_fee_dzd, same.relay_handling_dzd),
                         (0, 330, 150))

    def test_hidden_or_unknown_listing_and_bad_wilaya(self):
        self.assertEqual(self.client.get(ESTIMATE, {'listing': 99999, 'wilaya': 16}).status_code, 404)
        self.listing.deleted_at = timezone.now()
        self.listing.save()
        self.assertEqual(self.client.get(ESTIMATE, {'listing': self.listing.pk, 'wilaya': 16}).status_code, 404)
        self.assertEqual(self.client.get(ESTIMATE, {'listing': self.listing.pk, 'wilaya': 0}).status_code, 400)


class RelayPointTests(DeliveryTestCase):
    def test_every_fake_point_is_in_its_own_wilaya_and_commune(self):
        from .providers.fake_relay_points import RELAY_POINTS
        ids = [p.id for p in RELAY_POINTS]
        self.assertEqual(len(ids), len(set(ids)))
        for point in RELAY_POINTS:
            commune = Commune.objects.get(code=point.commune_code)
            self.assertEqual(commune.wilaya, point.wilaya, point.id)

    def test_without_position_the_buyers_commune_comes_first(self):
        response = self.client.get(RELAY, {'wilaya': 16, 'commune': 1618})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['commune']['code'], 1618)
        self.assertEqual(response.data[0]['commune']['name_fr'], 'Kouba')
        self.assertIsNone(response.data[0]['distance_km'])
        self.assertTrue({p['wilaya'] for p in response.data} == {16})
        for key in ('address', 'latitude', 'longitude', 'open_days', 'opens', 'closes'):
            self.assertIn(key, response.data[0])

    def test_with_position_the_nearest_comes_first(self):
        # Standing next to the Bab Ezzouar point.
        response = self.client.get(RELAY, {'wilaya': 16, 'lat': 36.721, 'lng': 3.183})
        self.assertEqual(response.data[0]['id'], 'FAKE-ALG-04')
        self.assertLess(response.data[0]['distance_km'], 1)
        distances = [p['distance_km'] for p in response.data]
        self.assertEqual(distances, sorted(distances))

    def test_a_wilaya_without_points_and_bad_input(self):
        self.assertEqual(self.client.get(RELAY, {'wilaya': 17}).data, [])
        self.assertEqual(self.client.get(RELAY, {'wilaya': 99}).status_code, 400)
        self.assertEqual(self.client.get(RELAY).status_code, 400)
        # A wrong position is ignored (sorted by commune instead).
        response = self.client.get(RELAY, {'wilaya': 31, 'lat': 'abc', 'lng': 500})
        self.assertIsNone(response.data[0]['distance_km'])


class CreateOrderTests(DeliveryTestCase):
    """The buyer taps "Acheter" and collects at a relay point (cash on delivery)."""

    def test_buyer_orders_with_three_amounts(self):
        order = self.create_order()
        self.assertEqual((order.buyer, order.seller), (self.buyer, self.seller))
        self.assertEqual(order.mode, Order.Mode.STOP_DESK)
        self.assertEqual(order.relay_point_id, 'FAKE-ALG-01')
        self.assertIn('Alger Centre', order.stop_desk_name)
        self.assertTrue(order.relay_point_address)
        self.assertEqual(order.commune_id, 1601)
        self.assertEqual(order.address, '')  # no home address is ever asked
        self.assertEqual(order.recipient_phone, '0771000102')
        # Oran -> Alger, small parcel at a relay point: 400 DA.
        self.assertEqual((order.item_price_dzd, order.delivery_price_dzd, order.buyer_fee_dzd),
                         (3500, 400, 180))
        self.assertEqual(order.total_to_pay_dzd, 4080)
        # No shipment until the seller confirms, within 24 hours.
        self.assertEqual(order.tracking_number, '')
        self.assertAlmostEqual((order.confirm_by - order.created_at).total_seconds(), 24 * 3600,
                               delta=5)
        self.assertEqual(list(order.events.values_list('status', flat=True)), ['created'])
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.RESERVED)
        # Both people are told; it uses the existing chat.
        for user in (self.buyer, self.seller):
            self.assertTrue(Notification.objects.filter(user=user, order=order).exists())
        self.assertEqual(order.conversation, self.conversation)

    def test_opens_a_chat_when_there_is_none(self):
        self.conversation.delete()
        order = self.create_order()
        self.assertEqual((order.conversation.buyer, order.conversation.seller),
                         (self.buyer, self.seller))
        self.assertFalse(order.conversation.messages.exists())

    def test_seller_never_sees_the_buyers_phone(self):
        order = self.create_order()
        self.client.force_authenticate(self.seller)
        data = self.client.get(f'{ORDERS}{order.pk}/').data
        self.assertEqual((data['recipient_name'], data['recipient_phone']), ('', ''))
        self.assertEqual(data['other_person']['display_name'], 'Yacine')
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(f'{ORDERS}{order.pk}/').data['recipient_phone'],
                         '0771000102')

    def test_must_be_logged_in_and_verified(self):
        self.assertEqual(self.client.post(ORDERS, self.order_data(), format='json').status_code, 401)
        User.objects.filter(pk=self.buyer.pk).update(phone_verified=False)
        self.buyer.refresh_from_db()
        self.client.force_authenticate(self.buyer)
        response = self.client.post(ORDERS, self.order_data(), format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_checks(self):
        self.client.force_authenticate(self.buyer)
        cases = [
            ({'relay_point': 'FAKE-ORN-01'}, 'relay_point'),  # an Oran point with wilaya 16
            ({'relay_point': 'nowhere'}, 'relay_point'),
            ({'relay_point': ''}, 'relay_point'),
            ({'recipient_phone': '0123'}, 'recipient_phone'),
            ({'recipient_name': ''}, 'recipient_name'),
            ({'wilaya': 99}, 'wilaya'),
        ]
        for extra, field in cases:
            response = self.client.post(ORDERS, self.order_data(**extra), format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, extra)
            self.assertIn(field, response.data, extra)
        self.assertFalse(Order.objects.exists())

    def test_not_my_own_item_and_not_twice(self):
        self.client.force_authenticate(self.seller)
        response = self.client.post(ORDERS, self.order_data(), format='json')
        self.assertEqual(response.data['code'], 'own_listing')
        first = self.create_order()
        response = self.client.post(ORDERS, self.order_data(), format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual((response.data['code'], response.data['order']), ('order_exists', first.pk))
        # Someone else can't buy it either now: it is reserved.
        self.client.force_authenticate(self.stranger)
        response = self.client.post(ORDERS, self.order_data(), format='json')
        self.assertEqual((response.status_code, response.data['code']), (409, 'not_available'))

    def test_sold_hidden_or_blocked(self):
        Listing.objects.filter(pk=self.listing.pk).update(status=Listing.Status.SOLD)
        self.client.force_authenticate(self.buyer)
        response = self.client.post(ORDERS, self.order_data(), format='json')
        self.assertEqual(response.data['code'], 'not_available')
        Listing.objects.filter(pk=self.listing.pk).update(status=Listing.Status.ACTIVE)
        from moderation.models import Block
        Block.objects.create(blocker=self.seller, blocked=self.buyer)
        response = self.client.post(ORDERS, self.order_data(), format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)  # hidden from them
        self.assertEqual(self.client.post(ORDERS, self.order_data(listing=99999),
                                          format='json').status_code, 404)

    def test_seller_has_to_confirm_first(self):
        order = self.create_order()
        self.client.force_authenticate(self.seller)
        data = self.client.get(f'{ORDERS}{order.pk}/').data
        self.assertTrue(data['can_confirm'])
        self.assertEqual(data['steps'], ['created', 'confirmed', 'dropped_off', 'in_transit',
                                         'at_relay', 'delivered'])
        self.client.force_authenticate(self.buyer)
        self.assertFalse(self.client.get(f'{ORDERS}{order.pk}/').data['can_confirm'])


class ConfirmTests(DeliveryTestCase):
    """Step E: the seller confirms within 24 hours and gets the shipment code."""

    def test_confirm_gives_the_shipment_code_and_drop_off_office(self):
        order = self.confirm(self.create_order())
        self.assertEqual(order.status, Order.Status.CONFIRMED)
        self.assertTrue(order.tracking_number.startswith('FAKE-'))
        self.assertEqual(order.drop_off_point_id, 'FAKE-ORN-01')
        self.assertIn('Oran', order.drop_off_point_name)
        self.assertTrue(order.drop_off_point_address)
        self.assertIsNotNone(order.confirmed_at)
        self.assertTrue(Notification.objects.filter(user=self.buyer, status='confirmed').exists())

    def test_only_the_seller_and_only_once(self):
        order = self.create_order()
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post(f'{ORDERS}{order.pk}/confirm/').status_code, 403)
        self.assertEqual(self.client.post(f'{ORDERS}{order.pk}/decline/').status_code, 403)
        self.confirm(order)
        response = self.client.post(f'{ORDERS}{order.pk}/confirm/', {'drop_off_point': 'FAKE-ORN-01'})
        self.assertEqual((response.status_code, response.data['code']), (409, 'not_waiting'))

    def test_drop_off_must_be_in_the_sellers_wilaya(self):
        order = self.create_order()
        self.confirm(order, point='FAKE-ALG-01', expect=400)  # an Alger office
        self.confirm(order, point='', expect=400)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CREATED)

    def test_same_wilaya_uses_the_buyers_office(self):
        self.listing.wilaya = Wilaya.ALGER
        self.listing.save()
        order = self.create_order(relay_point='FAKE-ALG-03')
        self.confirm(order, point='FAKE-ALG-01', expect=400)  # another office: no
        order = self.confirm(order, point='')                # nothing chosen: the buyer's
        self.assertEqual(order.drop_off_point_id, 'FAKE-ALG-03')
        self.client.force_authenticate(self.buyer)
        data = self.client.get(f'{ORDERS}{order.pk}/').data
        self.assertTrue(data['same_wilaya'])
        self.assertNotIn('in_transit', data['steps'])

    def test_decline_puts_the_item_back_on_sale(self):
        order = self.create_order()
        self.client.force_authenticate(self.seller)
        response = self.client.post(f'{ORDERS}{order.pk}/decline/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['status'], response.data['cancel_reason']),
                         ('cancelled', 'declined'))
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.ACTIVE)
        self.assertTrue(Notification.objects.filter(user=self.buyer, status='cancelled').exists())

    def test_not_confirmed_in_24_hours_is_cancelled(self):
        order = self.create_order()
        Order.objects.filter(pk=order.pk).update(confirm_by=timezone.now() - timedelta(minutes=1))
        self.client.force_authenticate(self.buyer)
        data = self.client.get(ORDERS).data['results'][0]  # reading the list is enough
        self.assertEqual((data['status'], data['cancel_reason']), ('cancelled', 'not_confirmed'))
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.ACTIVE)
        self.confirm(order, expect=409)  # too late for the seller now

    def test_sync_command_cancels_late_orders(self):
        order = self.create_order()
        Order.objects.filter(pk=order.pk).update(confirm_by=timezone.now() - timedelta(minutes=1))
        call_command('sync_deliveries', stdout=mock.MagicMock())
        order.refresh_from_db()
        self.assertEqual(order.cancel_reason, Order.CancelReason.NOT_CONFIRMED)

    def test_provider_error_changes_nothing(self):
        order = self.create_order()
        with mock.patch.object(FakeProvider, 'create_shipment', side_effect=ProviderError('down')):
            self.confirm(order, expect=503)
        order.refresh_from_db()
        self.assertEqual((order.status, order.tracking_number), (Order.Status.CREATED, ''))


# Seeing and following an order ----------------------------------------------------------

class TimelineTests(DeliveryTestCase):
    def test_buyer_and_seller_see_it_others_do_not(self):
        order = self.create_order()
        for user, role in ((self.seller, 'seller'), (self.buyer, 'buyer')):
            self.client.force_authenticate(user)
            response = self.client.get(f'{ORDERS}{order.pk}/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['i_am'], role)
            self.assertEqual(len(self.client.get(ORDERS).data['results']), 1)
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(f'{ORDERS}{order.pk}/').status_code, 404)
        self.assertEqual(self.client.get(ORDERS).data['results'], [])

    def test_filter_by_conversation_or_listing(self):
        order = self.create_order()
        data = self.client.get(ORDERS, {'conversation': self.conversation.pk}).data['results']
        self.assertEqual([o['id'] for o in data], [order.pk])
        data = self.client.get(ORDERS, {'listing': self.listing.pk}).data['results']
        self.assertEqual([o['id'] for o in data], [order.pk])
        self.assertEqual(self.client.get(ORDERS, {'listing': 'x'}).data['results'], [])

    def test_nothing_moves_before_the_seller_confirms(self):
        order = self.create_order()
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(hours=2))
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(f'{ORDERS}{order.pk}/').data['status'], 'created')

    def test_status_moves_forward_and_item_becomes_sold(self):
        order = self.age(self.confirm(self.create_order()), minutes=5)  # 2 steps of 2 minutes
        self.client.force_authenticate(self.buyer)
        data = self.client.get(f'{ORDERS}{order.pk}/').data
        self.assertEqual(data['status'], 'in_transit')
        self.assertEqual([e['status'] for e in data['events']],
                         ['created', 'confirmed', 'dropped_off', 'in_transit'])
        # Both people are told about each new step.
        self.assertEqual(Notification.objects.filter(user=self.seller, status='in_transit').count(), 1)

        order = self.age(order, minutes=60)
        data = self.client.get(f'{ORDERS}{order.pk}/').data
        self.assertEqual(data['status'], 'delivered')
        # (Pretending time passed shuffles the event times, so check the set.)
        self.assertTrue({'at_relay', 'delivered'} <= {e['status'] for e in data['events']})
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.SOLD)

    def test_refused_parcel_goes_back_and_the_item_is_on_sale_again(self):
        order = self.confirm(self.create_order(recipient_phone='0771000000'))
        order = self.age(order, minutes=60)
        services.sync_order(order, force=True)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.RETURNED)
        statuses = list(order.events.values_list('status', flat=True))
        self.assertEqual(statuses[-2:], ['refused', 'returned'])
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.ACTIVE)

    def test_cancel_until_drop_off_only(self):
        order = self.create_order()
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.post(f'{ORDERS}{order.pk}/cancel/').status_code, 404)
        self.client.force_authenticate(self.buyer)
        response = self.client.post(f'{ORDERS}{order.pk}/cancel/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['status'], response.data['cancel_reason']),
                         ('cancelled', 'buyer'))
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.ACTIVE)

        # Confirmed but not dropped off yet: the seller can still cancel.
        second = self.confirm(self.create_order())
        self.client.force_authenticate(self.seller)
        response = self.client.post(f'{ORDERS}{second.pk}/cancel/')
        self.assertEqual((response.status_code, response.data['cancel_reason']), (200, 'seller'))

        third = self.age(self.confirm(self.create_order()), minutes=3)  # dropped off already
        self.client.force_authenticate(self.buyer)
        response = self.client.post(f'{ORDERS}{third.pk}/cancel/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['code'], 'too_late')

    def test_sync_deliveries_command(self):
        order = self.age(self.confirm(self.create_order()), minutes=3)
        call_command('sync_deliveries', stdout=mock.MagicMock())
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.DROPPED_OFF)


OFFERS = '/api/offers/'


class OfferTests(DeliveryTestCase):
    """Step F: "Faire une offre" in the chat (the listing's price is 3,500 DA)."""

    def offer(self, amount, expect=201):
        self.client.force_authenticate(self.buyer)
        response = self.client.post(OFFERS, {'conversation': self.conversation.pk,
                                             'amount_dzd': amount}, format='json')
        self.assertEqual(response.status_code, expect, response.data)
        return response.data

    def answer(self, offer_id, what, user=None, expect=200):
        self.client.force_authenticate(user or self.seller)
        response = self.client.post(f'{OFFERS}{offer_id}/{what}/')
        self.assertEqual(response.status_code, expect, response.data)
        return response.data

    def chat(self, user):
        self.client.force_authenticate(user)
        return self.client.get(f'/api/conversations/{self.conversation.pk}/').data['messages']

    def test_offer_shows_in_the_chat_for_both(self):
        offer = self.offer(3000)['offer']
        self.assertEqual((offer['amount_dzd'], offer['list_price_dzd'], offer['status']),
                         (3000, 3500, 'pending'))
        # The seller has 1 unread message (before opening the chat).
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get('/api/conversations/unread-count/').data, {'unread': 1})
        for user, mine in ((self.buyer, True), (self.seller, False)):
            last = self.chat(user)[-1]
            self.assertEqual((last['kind'], last['is_mine'], last['text']), ('offer', mine, ''))
            self.assertEqual((last['offer']['event'], last['offer']['amount_dzd']), ('made', 3000))
        # The Messages list shows it too.
        self.client.force_authenticate(self.seller)
        row = self.client.get('/api/conversations/').data['results'][0]
        self.assertEqual(row['last_message']['offer'], {'amount_dzd': 3000, 'event': 'made'})

    def test_limits(self):
        self.assertEqual(self.offer(3500, expect=400)['code'], 'offer_too_high')
        data = self.offer(1700, expect=400)  # under half of 3,500
        self.assertEqual((data['code'], data['min_dzd']), ('offer_too_low', 1750))
        self.offer(1750)
        # Only the buyer of this chat.
        self.client.force_authenticate(self.seller)
        response = self.client.post(OFFERS, {'conversation': self.conversation.pk, 'amount_dzd': 3000})
        self.assertEqual(response.status_code, 404)
        # Not on a reserved item.
        Listing.objects.filter(pk=self.listing.pk).update(status=Listing.Status.RESERVED)
        self.assertEqual(self.offer(3000, expect=409)['code'], 'not_available')

    def test_a_new_offer_replaces_the_previous_one(self):
        first = self.offer(2800)['offer']
        self.offer(3000)
        self.assertEqual(Offer.objects.get(pk=first['id']).status, Offer.Status.WITHDRAWN)
        # The old card now says so (each message carries the offer as it is now).
        cards = [m for m in self.chat(self.seller) if m['kind'] == 'offer']
        self.assertEqual([c['offer']['status'] for c in cards], ['withdrawn', 'pending'])

    def test_accept_then_buy_at_that_price(self):
        offer = self.offer(3000)['offer']
        self.answer(offer['id'], 'accept', user=self.buyer, expect=403)  # not the seller
        data = self.answer(offer['id'], 'accept')['offer']
        self.assertEqual(data['status'], 'accepted')
        self.assertEqual(self.chat(self.buyer)[-1]['offer']['event'], 'accepted')
        self.answer(offer['id'], 'decline', expect=409)  # already answered

        # The estimate and the order use the offer's price (fee on 3,000: 150 DA).
        self.client.force_authenticate(self.buyer)
        estimate = self.client.get(ESTIMATE, {'listing': self.listing.pk, 'wilaya': 16,
                                              'offer': offer['id']}).data
        self.assertEqual((estimate['item_price_dzd'], estimate['buyer_fee_dzd']), (3000, 150))
        order = self.create_order(offer=offer['id'])
        self.assertEqual((order.item_price_dzd, order.buyer_fee_dzd, order.offer_id),
                         (3000, 150, offer['id']))
        self.assertEqual(Offer.objects.get(pk=offer['id']).status, Offer.Status.USED)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.price_dzd, 3500)  # the public price didn't change

    def test_offer_price_is_only_for_that_buyer_and_only_48_hours(self):
        offer = self.offer(3000)['offer']
        self.answer(offer['id'], 'accept')
        # Someone else can't use it.
        self.client.force_authenticate(self.stranger)
        response = self.client.post(ORDERS, self.order_data(offer=offer['id']), format='json')
        self.assertEqual((response.status_code, response.data['code']), (409, 'offer_unusable'))
        # Too late.
        Offer.objects.filter(pk=offer['id']).update(valid_until=timezone.now() - timedelta(minutes=1))
        self.client.force_authenticate(self.buyer)
        response = self.client.post(ORDERS, self.order_data(offer=offer['id']), format='json')
        self.assertEqual(response.data['code'], 'offer_unusable')
        self.assertEqual(self.chat(self.buyer)[-1]['offer']['status'], 'expired')

    def test_decline_and_withdraw(self):
        offer = self.offer(3000)['offer']
        self.assertEqual(self.answer(offer['id'], 'decline')['offer']['status'], 'declined')
        second = self.offer(3200)['offer']
        self.answer(second['id'], 'withdraw', expect=403)  # the seller can't withdraw it
        data = self.answer(second['id'], 'withdraw', user=self.buyer)
        self.assertEqual(data['offer']['status'], 'withdrawn')
        events = [m['offer']['event'] for m in self.chat(self.buyer) if m['kind'] == 'offer']
        self.assertEqual(events, ['made', 'declined', 'made', 'withdrawn'])

    def test_blocked_people_cannot_make_offers(self):
        from moderation.models import Block
        Block.objects.create(blocker=self.seller, blocked=self.buyer)
        self.assertEqual(self.offer(3000, expect=403)['code'], 'blocked')


class NotificationTests(DeliveryTestCase):
    def test_list_count_and_read(self):
        self.create_order()
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get('/api/notifications/unread-count/').data, {'unread': 1})
        self.client.force_authenticate(self.seller)  # the seller hears about the new order
        self.assertEqual(self.client.get('/api/notifications/unread-count/').data, {'unread': 1})
        self.client.force_authenticate(self.buyer)
        items = self.client.get('/api/notifications/').data['results']
        self.assertEqual((items[0]['status'], items[0]['role']), ('created', 'buyer'))
        self.assertEqual(items[0]['listing_title'], 'Veste en jean')
        self.client.post('/api/notifications/read/')
        self.assertEqual(self.client.get('/api/notifications/unread-count/').data, {'unread': 0})
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get('/api/notifications/').data['results'], [])


class AdminTests(DeliveryTestCase):
    def test_admin_pages_and_filters(self):
        order = self.confirm(self.create_order())  # confirmed: it has a shipment code
        admin = User.objects.create_superuser(phone='0799999981', password=PASSWORD,
                                              display_name='Admin')
        browser = Client()
        browser.force_login(admin)
        for url in ('/admin/delivery/order/', '/admin/delivery/order/?status__exact=created&wilaya__exact=16',
                    f'/admin/delivery/order/{order.pk}/change/', '/admin/delivery/commune/?wilaya__exact=16',
                    '/admin/delivery/notification/'):
            self.assertEqual(browser.get(url).status_code, 200, url)
        page = browser.get('/admin/delivery/order/?status__exact=delivered')
        self.assertNotContains(page, order.tracking_number)
        response = browser.post('/admin/delivery/order/', {'action': 'refresh_from_company',
                                                           '_selected_action': [order.pk]})
        self.assertEqual(response.status_code, 302)
