"""A pretend delivery company for testing (no real parcel, no real money).

- Prices: same wilaya 400 DA; between northern wilayas 600 DA; to or from the south
  900 DA; south to south 1,100 DA. Stop-desk is 200 DA cheaper (at least 250 DA).
  Medium parcels cost 200 DA more, large ones 500 DA more.
- Once the seller has confirmed, the parcel moves one step every
  DELIVERY_FAKE_STEP_MINUTES minutes (default 2): dropped off -> in transit (not in
  the same wilaya) -> at the pick-up point -> collected.
- A buyer phone ending in "0000" never collects it: refused -> returned to the seller
  (to try refusals).
- Relay points: test points in a few big wilayas (fake_relay_points.py).
"""

import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .base import DeliveryProvider, ProviderError, Quote, Shipment, TrackingUpdate
from .fake_relay_points import RELAY_POINTS

EXTRA_FOR_SIZE = {'small': 0, 'medium': 200, 'large': 500}

# The southern (Saharan) wilayas, where parcels take longer.
SOUTH = {1, 8, 11, 30, 32, 33, 37, 39, 47, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58}


class FakeProvider(DeliveryProvider):
    code = 'fake'
    name = 'Sougna Test Express'

    def quote(self, *, origin_wilaya, wilaya, commune_code, mode, parcel_size='small'):
        if origin_wilaya == wilaya:
            price, days = 400, (1, 2)
        elif origin_wilaya in SOUTH and wilaya in SOUTH:
            price, days = 1100, (4, 7)
        elif origin_wilaya in SOUTH or wilaya in SOUTH:
            price, days = 900, (3, 6)
        else:
            price, days = 600, (2, 3)
        stop_desk_name = ''
        if mode == 'stop_desk':
            price = max(250, price - 200)
            stop_desk_name = f'{self.name} - Bureau {commune_code}' if commune_code else ''
        price += EXTRA_FOR_SIZE.get(parcel_size, 0)
        return Quote(price_dzd=price, days_min=days[0], days_max=days[1], stop_desk_name=stop_desk_name)

    def relay_points(self, *, wilaya, commune_code=None):
        return [p for p in RELAY_POINTS
                if p.wilaya == wilaya and (commune_code is None or p.commune_code == commune_code)]

    def create_shipment(self, order):
        return Shipment(tracking_number=f'FAKE-{order.pk:06d}-{secrets.token_hex(2).upper()}')

    def _step(self):
        return timedelta(minutes=getattr(settings, 'DELIVERY_FAKE_STEP_MINUTES', 2))

    def tracking(self, order):
        start = order.confirmed_at
        if start is None:
            return []  # nothing happens before the seller confirms
        path = ['dropped_off']
        if order.origin_wilaya != order.wilaya:
            path.append('in_transit')
        path.append('at_relay')
        refused = order.recipient_phone.endswith('0000')
        path += ['refused', 'returned'] if refused else ['delivered']
        now = timezone.now()
        updates = []
        for n, status in enumerate(path, start=1):
            at = start + self._step() * n
            if at > now:
                break
            note = 'Not collected by the buyer' if status == 'refused' else ''
            updates.append(TrackingUpdate(status=status, at=at, note=note))
        return updates

    def cancel(self, order):
        if self.tracking(order):
            raise ProviderError('Already dropped off: it can no longer be cancelled.')
