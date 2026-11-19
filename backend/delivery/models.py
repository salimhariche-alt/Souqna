"""Delivery between wilayas (Step 5.1).

- Commune: the 1,541 communes of the 58 wilayas (loaded from data/communes.json).
- Order: a sale sent by a delivery company, with its three amounts kept separate
  (item, delivery, Sougna's buyer fee). Cash on delivery: NO real money is handled by
  Sougna yet - the amounts are only recorded (see CLAUDE.md: check with a lawyer).
- OrderEvent: the order's status timeline.
- Notification: simple in-app messages ("Your parcel is out for delivery").
- Offer: "Faire une offre" in the chat - a lower price for one buyer only, valid
  SOUGNA_OFFER_HOURS once the seller accepts (the public price doesn't change).
"""

from django.conf import settings
from django.db import models

from accounts.models import algerian_mobile
from souqna_api.wilayas import Wilaya


class Commune(models.Model):
    """One of Algeria's 1,541 communes. `code` is the official code (e.g. 1601)."""

    code = models.PositiveIntegerField(primary_key=True)
    wilaya = models.PositiveSmallIntegerField(choices=Wilaya.choices, db_index=True)
    name_fr = models.CharField(max_length=80)
    name_ar = models.CharField(max_length=80)

    class Meta:
        ordering = ['wilaya', 'name_fr']

    def __str__(self):
        return f'{self.name_fr} ({self.wilaya:02d})'


class Order(models.Model):
    class Mode(models.TextChoices):
        HOME = 'home', 'Home delivery'
        STOP_DESK = 'stop_desk', 'Stop-desk (relay point)'

    class Status(models.TextChoices):
        CREATED = 'created', 'Ordered - waiting for the seller'
        CONFIRMED = 'confirmed', 'Confirmed by the seller'
        DROPPED_OFF = 'dropped_off', 'Dropped off at the office'
        IN_TRANSIT = 'in_transit', 'In transit'
        AT_RELAY = 'at_relay', 'At the pick-up point'
        DELIVERED = 'delivered', 'Collected by the buyer'
        REFUSED = 'refused', 'Refused / not collected by the buyer'
        RETURNED = 'returned', 'Returned to the seller'
        CANCELLED = 'cancelled', 'Cancelled'

    class CancelReason(models.TextChoices):
        BUYER = 'buyer', 'Cancelled by the buyer'
        SELLER = 'seller', 'Cancelled by the seller'
        DECLINED = 'declined', 'Declined by the seller'
        NOT_CONFIRMED = 'not_confirmed', 'Not confirmed in time'
        ADMIN = 'admin', 'Cancelled by Sougna'

    # The normal way forward (same wilaya: no "in transit"). DELIVERED / RETURNED /
    # CANCELLED are the end; REFUSED is followed by RETURNED.
    STEPS = [Status.CREATED, Status.CONFIRMED, Status.DROPPED_OFF, Status.IN_TRANSIT,
             Status.AT_RELAY, Status.DELIVERED]
    FINAL = {Status.DELIVERED, Status.RETURNED, Status.CANCELLED}
    # Until the parcel is at the office, the order can still be cancelled.
    CANCELLABLE = {Status.CREATED, Status.CONFIRMED}

    conversation = models.ForeignKey('messaging.Conversation', on_delete=models.PROTECT,
                                     related_name='orders')
    listing = models.ForeignKey('listings.Listing', on_delete=models.PROTECT, related_name='orders')
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                              related_name='orders_as_buyer')
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                               related_name='orders_as_seller')

    # Delivery company: "fake" for now; later "yalidine", "zr_express", "maystro"...
    provider = models.CharField(max_length=30)
    mode = models.CharField(max_length=10, choices=Mode.choices)
    origin_wilaya = models.PositiveSmallIntegerField(choices=Wilaya.choices)
    wilaya = models.PositiveSmallIntegerField(choices=Wilaya.choices, db_index=True)
    commune = models.ForeignKey(Commune, on_delete=models.PROTECT, related_name='orders')
    address = models.CharField(max_length=300, blank=True)  # home delivery only (not used now)
    # The relay point (courier's office) chosen by the buyer, copied at order time.
    relay_point_id = models.CharField(max_length=60, blank=True)
    stop_desk_name = models.CharField('relay point', max_length=200, blank=True)
    relay_point_address = models.CharField(max_length=300, blank=True)
    recipient_name = models.CharField(max_length=80)
    recipient_phone = models.CharField(max_length=10, validators=[algerian_mobile])

    # Cash on delivery: recorded separately, no money is moved by Sougna yet.
    item_price_dzd = models.PositiveIntegerField()
    delivery_price_dzd = models.PositiveIntegerField()
    buyer_fee_dzd = models.PositiveIntegerField()
    # Bought at an accepted offer's price (item_price_dzd is then the offer's amount).
    offer = models.ForeignKey('Offer', null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='orders')
    # Same-wilaya sales: the part of Sougna's fee owed to the relay office that keeps
    # the parcel (the buyer pays no delivery). 0 otherwise.
    relay_handling_dzd = models.PositiveIntegerField(default=0)

    # The seller must confirm before `confirm_by` (SOUGNA_CONFIRM_HOURS), then drops the
    # parcel at this office with the shipment code (`tracking_number`).
    confirm_by = models.DateTimeField(null=True, blank=True, db_index=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    drop_off_point_id = models.CharField(max_length=60, blank=True)
    drop_off_point_name = models.CharField('drop-off office', max_length=200, blank=True)
    drop_off_point_address = models.CharField(max_length=300, blank=True)
    cancel_reason = models.CharField(max_length=20, choices=CancelReason.choices, blank=True)

    tracking_number = models.CharField('shipment code', max_length=60, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREATED,
                              db_index=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Order #{self.pk} - {self.listing.title[:40]} ({self.get_status_display()})'

    @property
    def total_to_pay_dzd(self) -> int:
        """What the buyer pays the courier at delivery."""
        return self.item_price_dzd + self.delivery_price_dzd + self.buyer_fee_dzd

    @property
    def is_final(self) -> bool:
        return self.status in self.FINAL

    @property
    def same_wilaya(self) -> bool:
        """Dropped off at the buyer's own office: no transport between wilayas."""
        return self.origin_wilaya == self.wilaya

    def steps(self) -> list[str]:
        """The timeline's steps for this order."""
        return [s for s in self.STEPS if not (self.same_wilaya and s == self.Status.IN_TRANSIT)]


class Offer(models.Model):
    """A buyer's price offer in a chat. Shown as chat messages (made / accepted / ...)."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Waiting for the seller'
        ACCEPTED = 'accepted', 'Accepted'
        DECLINED = 'declined', 'Declined'
        WITHDRAWN = 'withdrawn', 'Withdrawn / replaced by the buyer'
        USED = 'used', 'Used for an order'

    conversation = models.ForeignKey('messaging.Conversation', on_delete=models.CASCADE,
                                     related_name='offers')
    listing = models.ForeignKey('listings.Listing', on_delete=models.CASCADE, related_name='offers')
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='offers_made')
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name='offers_received')
    amount_dzd = models.PositiveIntegerField()
    # The listing's price when the offer was made (to show "-14 %").
    list_price_dzd = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING,
                              db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    # Accepted: the buyer can buy at this price until then.
    valid_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'Offer #{self.pk}: {self.amount_dzd} DA for {self.listing.title[:40]} ({self.status})'

    @property
    def is_usable(self) -> bool:
        """Accepted, not used yet and not too late."""
        from django.utils import timezone
        return (self.status == self.Status.ACCEPTED and self.valid_until is not None
                and timezone.now() < self.valid_until)

    @property
    def shown_status(self) -> str:
        """As the app shows it: an accepted offer past its time is "expired"."""
        if self.status == self.Status.ACCEPTED and not self.is_usable:
            return 'expired'
        return self.status


class OrderEvent(models.Model):
    """One step of an order's timeline (shown to the buyer and the seller)."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='events')
    status = models.CharField(max_length=20, choices=Order.Status.choices)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField()

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'{self.get_status_display()} at {self.created_at:%d/%m %H:%M}'


class Notification(models.Model):
    """A simple message in the app (the app writes the text in the user's language)."""

    class Kind(models.TextChoices):
        ORDER_STATUS = 'order_status', 'Order status changed'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='notifications')
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.ORDER_STATUS)
    order = models.ForeignKey(Order, null=True, blank=True, on_delete=models.CASCADE,
                              related_name='notifications')
    status = models.CharField(max_length=20, choices=Order.Status.choices, blank=True)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.user} - {self.get_kind_display()} ({self.status})'
