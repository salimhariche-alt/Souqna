from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPhoneVerified
from listings.models import Listing
from listings.visibility import visible_listing_q
from moderation.models import Block

from . import services
from .models import Commune, Notification, Order
from .providers import ProviderError
from .serializers import (
    CheckoutSerializer,
    CommuneSerializer,
    NotificationSerializer,
    OrderSerializer,
)


class CommuneListView(APIView):
    """GET /api/communes/?wilaya=16 - the communes of one wilaya (official code, fr, ar)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        wilaya = request.query_params.get('wilaya', '')
        if not wilaya.isdigit():
            return Response({'wilaya': ['Choose a wilaya number from 1 to 58.']},
                            status=status.HTTP_400_BAD_REQUEST)
        communes = Commune.objects.filter(wilaya=int(wilaya)).order_by('name_fr')
        return Response(CommuneSerializer(communes, many=True).data)


class EstimateView(APIView):
    """GET /api/delivery/estimate/?listing=12&wilaya=16 - on the listing page: what
    delivery to that wilaya costs (pick-up at the courier's office, paid by the buyer),
    how long it takes, Sougna's fee and the total. Anyone can ask (no login)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        listing_id = request.query_params.get('listing', '')
        wilaya = request.query_params.get('wilaya', '')
        if not wilaya.isdigit() or not 1 <= int(wilaya) <= 58:
            return Response({'wilaya': ['Choose a wilaya number from 1 to 58.']},
                            status=status.HTTP_400_BAD_REQUEST)
        visible = visible_listing_q(request.user)
        if request.user.is_authenticated:
            visible |= Q(seller=request.user)
        listing = Listing.objects.filter(visible, deleted_at__isnull=True,
                                         pk=int(listing_id) if listing_id.isdigit() else 0).first()
        if listing is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = services.quote(listing=listing, wilaya=int(wilaya))
        except ProviderError as error:
            return Response({'detail': str(error), 'code': 'provider_error'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        result['wilaya'] = int(wilaya)
        result.pop('stop_desk_name', None)
        result.pop('relay_handling_dzd', None)  # our cost, not the buyer's business
        return Response(result)


def _number(value, low, high):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if low <= number <= high else None


class RelayPointListView(APIView):
    """GET /api/delivery/relay-points/?wilaya=16[&commune=1601][&lat=36.7&lng=3.05]

    The delivery company's relay points in a wilaya: nearest first when the phone's
    position is given, otherwise the buyer's commune first."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        wilaya = request.query_params.get('wilaya', '')
        if not wilaya.isdigit() or not 1 <= int(wilaya) <= 58:
            return Response({'wilaya': ['Choose a wilaya number from 1 to 58.']},
                            status=status.HTTP_400_BAD_REQUEST)
        commune = request.query_params.get('commune', '')
        lat = _number(request.query_params.get('lat'), -90, 90)
        lng = _number(request.query_params.get('lng'), -180, 180)
        if lat is None or lng is None:
            lat = lng = None
        try:
            points = services.relay_points(
                wilaya=int(wilaya), commune_code=int(commune) if commune.isdigit() else None,
                latitude=lat, longitude=lng)
        except ProviderError as error:
            return Response({'detail': str(error), 'code': 'provider_error'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(points)


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Orders sent by delivery. You only ever see orders where you are the buyer or the seller.

    - GET  /api/orders/                    my orders, newest first (?conversation= or ?listing=)
    - POST /api/orders/                    the BUYER taps "Acheter": {"listing", "wilaya",
                                           "relay_point", "recipient_name", "recipient_phone"}
    - GET  /api/orders/{id}/               one order with its timeline (asks the company for news)
    - POST /api/orders/{id}/cancel/        buyer or seller cancels before pick-up
    """

    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.IsAuthenticated(), IsPhoneVerified()]
        return super().get_permissions()

    def get_queryset(self):
        me = self.request.user
        orders = (Order.objects.filter(Q(buyer=me) | Q(seller=me))
                  .select_related('listing', 'commune', 'buyer', 'seller')
                  .prefetch_related('events', 'listing__photos'))
        if self.action == 'list':
            for param, field in (('conversation', 'conversation_id'), ('listing', 'listing_id')):
                value = self.request.query_params.get(param)
                if value is None:
                    continue
                if not value.isdigit():
                    return orders.none()
                orders = orders.filter(**{field: int(value)})
        return orders

    def retrieve(self, request, pk=None):
        order = self.get_object()
        services.sync_order(order)
        order = self.get_queryset().get(pk=order.pk)
        return Response(self.get_serializer(order).data)

    def create(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        me = request.user
        visible = visible_listing_q(me)
        listing = (Listing.objects.filter(visible, deleted_at__isnull=True, pk=data['listing'])
                   .select_related('seller').first())
        if listing is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if listing.seller_id == me.pk:
            return Response({'detail': "You can't buy your own item.", 'code': 'own_listing'},
                            status=status.HTTP_400_BAD_REQUEST)
        mine = Order.objects.filter(listing=listing, buyer=me).exclude(status__in=Order.FINAL).first()
        if mine:
            return Response({'detail': 'You have already ordered this item.',
                             'code': 'order_exists', 'order': mine.pk},
                            status=status.HTTP_409_CONFLICT)
        if listing.status != Listing.Status.ACTIVE:
            return Response({'detail': 'This item is no longer available.',
                             'code': 'not_available'}, status=status.HTTP_409_CONFLICT)
        if Block.between(me, listing.seller):
            return Response({'detail': "You can't buy from this person.", 'code': 'blocked'},
                            status=status.HTTP_403_FORBIDDEN)
        try:
            order = services.create_order(buyer=me, listing=listing, data=data)
        except ProviderError as error:
            return Response({'detail': str(error), 'code': 'provider_error'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        order = self.get_queryset().get(pk=order.pk)
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()  # only the buyer's or the seller's orders
        try:
            services.cancel_order(order)
        except ProviderError:
            return Response({'detail': 'Already picked up: it can no longer be cancelled.',
                             'code': 'too_late'}, status=status.HTTP_409_CONFLICT)
        order = self.get_queryset().get(pk=order.pk)
        return Response(self.get_serializer(order).data)


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    - GET  /api/notifications/               my notifications, newest first
    - GET  /api/notifications/unread-count/  {"unread": n} (the dot on Home's bell)
    - POST /api/notifications/read/          mark them all as read
    """

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).select_related('order__listing')

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        return Response({'unread': self.get_queryset().filter(read=False).count()})

    @action(detail=False, methods=['post'])
    def read(self, request):
        self.get_queryset().filter(read=False).update(read=True)
        return Response({'unread': 0})
