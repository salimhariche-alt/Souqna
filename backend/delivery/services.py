"""The delivery rules, in one place (used by the API, the admin and sync_deliveries)."""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from listings.models import Listing

from .models import Notification, Order, OrderEvent
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


def quote(*, listing, wilaya, commune, mode):
    """The delivery price (from the company) plus our amounts, for the app's form."""
    q = get_provider().quote(origin_wilaya=listing.wilaya, wilaya=wilaya, commune_code=commune.code,
                             mode=mode)
    fee = buyer_fee(listing.price_dzd)
    return {
        'provider': get_provider().name,
        'item_price_dzd': listing.price_dzd,
        'delivery_price_dzd': q.price_dzd,
        'buyer_fee_dzd': fee,
        'total_dzd': listing.price_dzd + q.price_dzd + fee,
        'days_min': q.days_min,
        'days_max': q.days_max,
        'stop_desk_name': q.stop_desk_name,
    }


def notify(order, status, users):
    Notification.objects.bulk_create(
        [Notification(user=user, order=order, status=status) for user in users])


def create_order(*, conversation, data):
    """The seller sends the item by delivery. Raises ProviderError if the company refuses."""
    listing = conversation.listing
    provider = get_provider()
    with transaction.atomic():
        q = provider.quote(origin_wilaya=listing.wilaya, wilaya=data['wilaya'],
                           commune_code=data['commune'].code, mode=data['mode'])
        order = Order.objects.create(
            conversation=conversation, listing=listing, buyer=conversation.buyer,
            seller=conversation.seller, provider=provider.code, mode=data['mode'],
            origin_wilaya=listing.wilaya, wilaya=data['wilaya'], commune=data['commune'],
            address=data.get('address', '') if data['mode'] == Order.Mode.HOME else '',
            stop_desk_name=q.stop_desk_name if data['mode'] == Order.Mode.STOP_DESK else '',
            recipient_name=data['recipient_name'], recipient_phone=data['recipient_phone'],
            item_price_dzd=listing.price_dzd, delivery_price_dzd=q.price_dzd,
            buyer_fee_dzd=buyer_fee(listing.price_dzd),
        )
        shipment = provider.create_shipment(order)  # ProviderError undoes everything
        order.tracking_number = shipment.tracking_number
        order.last_synced_at = timezone.now()
        order.save(update_fields=['tracking_number', 'last_synced_at'])
        OrderEvent.objects.create(order=order, status=Order.Status.CREATED, created_at=order.created_at)
        # The item is promised to this buyer now.
        if listing.status == Listing.Status.ACTIVE:
            Listing.objects.filter(pk=listing.pk).update(status=Listing.Status.RESERVED)
        notify(order, Order.Status.CREATED, [order.buyer])
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
    """The seller cancels before pick-up. Raises ProviderError if it is too late."""
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
