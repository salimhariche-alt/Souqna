from rest_framework import serializers

from accounts.models import PHONE_ERROR, normalize_phone
from souqna_api.wilayas import Wilaya

from .models import Commune, Notification, Order, OrderEvent

# The app recognises these sentences and translates them.
ERRORS = {
    'relay_point_required': 'Choose a relay point.',
    'name_required': 'Enter your name.',
}


class CommuneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Commune
        fields = ['code', 'wilaya', 'name_fr', 'name_ar']


class CheckoutSerializer(serializers.Serializer):
    """What the buyer sends with "Acheter": the item, the relay point where they will
    collect it (in their wilaya), and their name and phone - for the courier only."""

    listing = serializers.IntegerField()
    wilaya = serializers.ChoiceField(choices=Wilaya.choices, error_messages={
        'invalid_choice': 'Choose a wilaya number from 1 to 58.'})
    relay_point = serializers.CharField(max_length=60, error_messages={
        'required': ERRORS['relay_point_required'], 'blank': ERRORS['relay_point_required']})
    recipient_name = serializers.CharField(max_length=80, error_messages={
        'required': ERRORS['name_required'], 'blank': ERRORS['name_required']})
    recipient_phone = serializers.CharField(max_length=20)

    def validate_recipient_phone(self, value):
        phone = normalize_phone(value)
        if len(phone) != 10 or not phone.isdigit() or phone[:2] not in ('05', '06', '07'):
            raise serializers.ValidationError(PHONE_ERROR)
        return phone

    def validate(self, data):
        from .providers import get_provider
        point = next((p for p in get_provider().relay_points(wilaya=data['wilaya'])
                      if p.id == data['relay_point']), None)
        if point is None:
            raise serializers.ValidationError({'relay_point': ERRORS['relay_point_required']})
        data['relay_point'] = point
        data['commune'] = Commune.objects.get(code=point.commune_code)
        data['recipient_name'] = data['recipient_name'].strip()
        return data


class OrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderEvent
        fields = ['status', 'note', 'created_at']


class OrderSerializer(serializers.ModelSerializer):
    """An order as the buyer or the seller sees it."""

    listing = serializers.SerializerMethodField()
    commune = CommuneSerializer(read_only=True)
    events = OrderEventSerializer(many=True, read_only=True)
    total_to_pay_dzd = serializers.IntegerField(read_only=True)
    i_am = serializers.SerializerMethodField()
    other_person = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'conversation', 'listing', 'provider', 'mode', 'origin_wilaya', 'wilaya',
                  'commune', 'relay_point_id', 'stop_desk_name', 'relay_point_address',
                  'recipient_name', 'recipient_phone',
                  'item_price_dzd', 'delivery_price_dzd', 'buyer_fee_dzd', 'total_to_pay_dzd',
                  'tracking_number', 'status', 'events', 'i_am', 'other_person', 'can_cancel',
                  'created_at', 'updated_at']

    def get_listing(self, order):
        from listings.serializers import cover_photo_url
        request = self.context.get('request')
        return {'id': order.listing_id, 'title': order.listing.title,
                'cover_photo': cover_photo_url(order.listing, request)}

    def _me(self):
        request = self.context.get('request')
        return getattr(request, 'user', None)

    def get_i_am(self, order):
        return 'seller' if self._me() and self._me().pk == order.seller_id else 'buyer'

    def get_other_person(self, order):
        other = order.buyer if self.get_i_am(order) == 'seller' else order.seller
        return {'id': other.pk, 'display_name': other.display_name}

    def get_can_cancel(self, order):
        # Buyer or seller, until the courier has the parcel.
        return order.status == Order.Status.CREATED

    def to_representation(self, order):
        data = super().to_representation(order)
        if data['i_am'] == 'seller':
            # The buyer's name and phone are only for the courier (data protection).
            data['recipient_name'] = ''
            data['recipient_phone'] = ''
        return data


class NotificationSerializer(serializers.ModelSerializer):
    listing_title = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ['id', 'kind', 'order', 'status', 'listing_title', 'read', 'created_at']

    def get_listing_title(self, notification):
        return notification.order.listing.title if notification.order_id else ''
