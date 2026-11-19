"""The delivery rules, in one place (used by the API, the admin and sync_deliveries)."""

from datetime import timedelta
from math import asin, cos, radians, sin, sqrt

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from listings.models import Listing

from .models import Commune, Notification, Order, OrderEvent
from .providers import ProviderError, get_provider

# The app shows the newest status when an order is opened; ask the company at most this often.
SYNC_EVERY = timedelta(seconds=30)


def buyer_fee(item_price_dzd: int) -> int:
    """Sougna's fee for the buyer: SOUGNA_BUYER_FEE_PERCENT of the price (at least
    SOUGNA_BUYER_FEE_MIN_DZD), rounded to 10 DA. Only RECORDED for now - no money is
    taken (see CLAUDE.md: the money flow must be checked with a lawyer)."""
    fee = item_price_dzd * settings.SOUGNA_BUYER_FEE_PERCENT / 100
    fee = max(settings.SOUGNA_BUYER_FEE_MIN_DZD, fee)
    return int(round(fee / 10) * 10)


def is_same_wilaya(listing, wilaya) -> bool:
    """Seller and buyer in the same wilaya, with relay pick-up: the seller drops the
    parcel at the office where the buyer collects it - no transport between wilayas."""
    return listing.wilaya == wilaya and settings.SOUGNA_SAME_WILAYA_DROP_OFF


def quote(*, listing, wilaya, commune=None, mode=Order.Mode.STOP_DESK):
    """The delivery price (from the company) plus our amounts - used for the listing
    page's estimate (no commune), the order form and the order itself.

    Same wilaya (relay pick-up): delivery is FREE for the buyer; Sougna's fee gets
    SOUGNA_SAME_WILAYA_EXTRA_FEE_DZD more, and SOUGNA_RELAY_HANDLING_DZD of the fee is
    owed to the relay office for keeping the parcel (`relay_handling_dzd`)."""
    provider = get_provider()
    q = provider.quote(origin_wilaya=listing.wilaya, wilaya=wilaya,
                       commune_code=commune.code if commune else None,
                       mode=mode, parcel_size=listing.parcel_size)
    fee = buyer_fee(listing.price_dzd)
    delivery, handling, days = q.price_dzd, 0, (q.days_min, q.days_max)
    same = mode == Order.Mode.STOP_DESK and is_same_wilaya(listing, wilaya)
    if same:
        delivery, days = 0, (1, 2)
        fee += settings.SOUGNA_SAME_WILAYA_EXTRA_FEE_DZD
        handling = settings.SOUGNA_RELAY_HANDLING_DZD
    return {
        'provider': provider.name,
        'same_wilaya': same,
        'item_price_dzd': listing.price_dzd,
        'delivery_price_dzd': delivery,
        'buyer_fee_dzd': fee,
        'relay_handling_dzd': handling,
        'total_dzd': listing.price_dzd + delivery + fee,
        'days_min': days[0],
        'days_max': days[1],
        'stop_desk_name': q.stop_desk_name,
    }


def notify(order, status, users):
    Notification.objects.bulk_create(
        [Notification(user=user, order=order, status=status) for user in users])


def create_order(*, buyer, listing, data):
    """The buyer taps "Acheter": pick-up at a relay point, cash on delivery.

    Opens (or reuses) the buyer's chat with the seller, reserves the item and tells
    both people. Raises ProviderError if the company refuses (nothing is saved)."""
    from messaging.models import Conversation

    provider = get_provider()
    point = data['relay_point']
    with transaction.atomic():
        conversation, _ = Conversation.objects.get_or_create(
            listing=listing, buyer=buyer, defaults={'seller': listing.seller})
        q = quote(listing=listing, wilaya=data['wilaya'], commune=data['commune'],
                  mode=Order.Mode.STOP_DESK)
        order = Order.objects.create(
            conversation=conversation, listing=listing, buyer=buyer,
            seller=listing.seller, provider=provider.code, mode=Order.Mode.STOP_DESK,
            origin_wilaya=listing.wilaya, wilaya=data['wilaya'], commune=data['commune'],
            relay_point_id=point.id, stop_desk_name=point.name,
            relay_point_address=point.address,
            recipient_name=data['recipient_name'], recipient_phone=data['recipient_phone'],
            item_price_dzd=listing.price_dzd, delivery_price_dzd=q['delivery_price_dzd'],
            buyer_fee_dzd=q['buyer_fee_dzd'], relay_handling_dzd=q['relay_handling_dzd'],
        )
        shipment = provider.create_shipment(order)  # ProviderError undoes everything
        order.tracking_number = shipment.tracking_number
        order.last_synced_at = timezone.now()
        order.save(update_fields=['tracking_number', 'last_synced_at'])
        OrderEvent.objects.create(order=order, status=Order.Status.CREATED, created_at=order.created_at)
        # The item is promised to this buyer now.
        if listing.status == Listing.Status.ACTIVE:
            Listing.objects.filter(pk=listing.pk).update(status=Listing.Status.RESERVED)
        notify(order, Order.Status.CREATED, [order.buyer, order.seller])
    return order


def _listing_after(order):
    if order.status == Order.Status.DELIVERED:
        Listing.objects.filter(pk=order.listing_id).update(status=Listing.Status.SOLD)
    elif order.status in (Order.Status.RETURNED, Order.Status.CANCELLED):
        # Back on sale (unless the seller already changed it).
        Listing.objects.filter(pk=order.listing_id, status=Listing.Status.RESERVED).update(
            status=Listing.Status.ACTIVE)


def sync_order(order, force=False):
    """Ask the company for news; add new steps to the timeline and notify both people."""
    if order.is_final:
        return order
    now = timezone.now()
    if not force and order.last_synced_at and now - order.last_synced_at < SYNC_EVERY:
        return order
    try:
        updates = get_provider().tracking(order)
    except ProviderError:
        return order  # try again next time
    seen = set(order.events.values_list('status', flat=True))
    with transaction.atomic():
        for update in updates:
            if update.status in seen or update.status not in Order.Status.values:
                continue
            OrderEvent.objects.create(order=order, status=update.status, note=update.note[:200],
                                      created_at=update.at)
            seen.add(update.status)
            order.status = update.status
            notify(order, update.status, [order.buyer, order.seller])
        order.last_synced_at = now
        order.save(update_fields=['status', 'last_synced_at', 'updated_at'])
        _listing_after(order)
    return order


def cancel_order(order):
    """The buyer or the seller cancels before pick-up. Raises ProviderError if too late."""
    if order.status != Order.Status.CREATED:
        raise ProviderError('Already picked up: it can no longer be cancelled.')
    get_provider().cancel(order)
    with transaction.atomic():
        order.status = Order.Status.CANCELLED
        order.save(update_fields=['status', 'updated_at'])
        OrderEvent.objects.create(order=order, status=Order.Status.CANCELLED, created_at=timezone.now())
        notify(order, Order.Status.CANCELLED, [order.buyer])
        _listing_after(order)
    return order


def _distance_km(lat1, lng1, lat2, lng2):
    """Straight-line distance on the Earth (haversine formula)."""
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 6371 * 2 * asin(sqrt(a))


def relay_points(*, wilaya, commune_code=None, latitude=None, longitude=None):
    """The company's relay points in a wilaya, as dicts for the app.

    With the phone's position: nearest first (with `distance_km`). Without it: the
    points in the buyer's commune first, then the others by name."""
    points = get_provider().relay_points(wilaya=wilaya)
    names = {c.code: c for c in Commune.objects.filter(code__in={p.commune_code for p in points})}
    rows = []
    for p in points:
        commune = names.get(p.commune_code)
        distance = None
        if latitude is not None and longitude is not None:
            distance = round(_distance_km(latitude, longitude, p.latitude, p.longitude), 1)
        rows.append({
            'id': p.id, 'name': p.name, 'address': p.address, 'wilaya': p.wilaya,
            'commune': {'code': p.commune_code,
                        'name_fr': commune.name_fr if commune else '',
                        'name_ar': commune.name_ar if commune else ''},
            'latitude': p.latitude, 'longitude': p.longitude,
            'open_days': p.open_days, 'opens': p.opens, 'closes': p.closes, 'phone': p.phone,
            'distance_km': distance,
        })
    if latitude is not None and longitude is not None:
        rows.sort(key=lambda r: r['distance_km'])
    else:
        rows.sort(key=lambda r: (r['commune']['code'] != commune_code, r['name']))
    return rows
