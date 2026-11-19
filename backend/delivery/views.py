from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPhoneVerified
from listings.models import Listing
from listings.visibility import visible_listing_q
from moderation.models import Block

from . import services
from .models import Commune, Notification, Offer, Order, Review
from .providers import ProviderError
from .serializers import (
    CheckoutSerializer,
    CommuneSerializer,
    ConfirmSerializer,
    OfferRequestSerializer,
    PublicReviewSerializer,
    ReviewRequestSerializer,
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


def _usable_offer(user, offer_id, listing):
    """My accepted, unused, still valid offer for this listing (else None)."""
    if not user.is_authenticated or not str(offer_id or '').isdigit():
        return None
    offer = Offer.objects.filter(pk=int(offer_id), buyer=user, listing=listing).first()
    return offer if offer and offer.is_usable else None


# "Faire une offre": at most this many offers a day per buyer (against spam).
OFFERS_PER_DAY = 20


class EstimateView(APIView):
    """GET /api/delivery/estimate/?listing=12&wilaya=16[&offer=3] - on the listing page:
    what delivery to that wilaya costs (pick-up at the courier's office, paid by the
    buyer), how long it takes, Sougna's fee and the total. Anyone can ask (no login);
    with my accepted offer, the item price is the offer's."""

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
            offer = _usable_offer(request.user, request.query_params.get('offer'), listing)
            result = services.quote(listing=listing, wilaya=int(wilaya),
                                    price=offer.amount_dzd if offer else None)
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
    - POST /api/orders/{id}/confirm/       the seller confirms: {"drop_off_point"} -> shipment code
    - POST /api/orders/{id}/decline/       the seller says no
    - POST /api/orders/{id}/cancel/        buyer or seller cancels before drop-off

    The seller has SOUGNA_CONFIRM_HOURS to confirm; after that the order is cancelled
    (checked whenever orders are read, and by `manage.py sync_deliveries`).
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
                  .prefetch_related('events', 'reviews', 'listing__photos'))
        if self.action == 'list':
            for param, field in (('conversation', 'conversation_id'), ('listing', 'listing_id')):
                value = self.request.query_params.get(param)
                if value is None:
                    continue
                if not value.isdigit():
                    return orders.none()
                orders = orders.filter(**{field: int(value)})
        return orders

    def list(self, request, *args, **kwargs):
        me = request.user
        services.expire_late_orders(Order.objects.filter(Q(buyer=me) | Q(seller=me)))
        return super().list(request, *args, **kwargs)

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
            services.check_order_limit(me)  # parcels not collected, orders in progress
        except services.OrderLimit as error:
            return Response({'detail': str(error), 'code': error.code, **error.extra},
                            status=status.HTTP_403_FORBIDDEN)
        offer = None
        if data.get('offer'):
            offer = _usable_offer(me, data['offer'], listing)
            if offer is None:
                return Response({'detail': 'This offer can no longer be used.',
                                 'code': 'offer_unusable'}, status=status.HTTP_409_CONFLICT)
        try:
            order = services.create_order(buyer=me, listing=listing, data=data, offer=offer)
        except ProviderError as error:
            return Response({'detail': str(error), 'code': 'provider_error'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        order = self.get_queryset().get(pk=order.pk)
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)

    def _mine_as_seller(self, request):
        order = self.get_object()  # only the buyer's or the seller's orders
        if order.seller_id != request.user.pk:
            return order, Response({'detail': 'Only the seller can do this.', 'code': 'not_seller'},
                                   status=status.HTTP_403_FORBIDDEN)
        return order, None

    def _not_waiting(self):
        return Response({'detail': 'This order is no longer waiting for your confirmation.',
                         'code': 'not_waiting'}, status=status.HTTP_409_CONFLICT)

    def _fresh(self, order):
        return Response(self.get_serializer(self.get_queryset().get(pk=order.pk)).data)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        order, refused = self._mine_as_seller(request)
        if refused:
            return refused
        serializer = ConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.confirm_order(order, serializer.validated_data.get('drop_off_point', ''))
        except services.NotWaiting:
            return self._not_waiting()
        except services.BadDropOff:
            return Response({'drop_off_point': ['Choose a drop-off office.']},
                            status=status.HTTP_400_BAD_REQUEST)
        except ProviderError as error:
            return Response({'detail': str(error), 'code': 'provider_error'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return self._fresh(order)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        order, refused = self._mine_as_seller(request)
        if refused:
            return refused
        try:
            services.decline_order(order)
        except services.NotWaiting:
            return self._not_waiting()
        return self._fresh(order)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """POST /api/orders/{id}/review/ {"stars": 1-5, "comment"} - after delivery."""
        order = self.get_object()  # only the buyer's or the seller's orders
        serializer = ReviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.write_review(order, request.user, serializer.validated_data['stars'],
                                  serializer.validated_data.get('comment', ''))
        except services.ReviewRefused as error:
            field = 'comment' if error.code == 'review_words' else None
            if field:
                return Response({field: [str(error)]}, status=status.HTTP_400_BAD_REQUEST)
            return Response({'detail': str(error), 'code': error.code},
                            status=status.HTTP_409_CONFLICT)
        return self._fresh(order)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()  # only the buyer's or the seller's orders
        services.expire_if_late(order)
        reason = (Order.CancelReason.SELLER if order.seller_id == request.user.pk
                  else Order.CancelReason.BUYER)
        try:
            services.cancel_order(order, reason)
        except ProviderError:
            return Response({'detail': 'Already dropped off: it can no longer be cancelled.',
                             'code': 'too_late'}, status=status.HTTP_409_CONFLICT)
        return self._fresh(order)


class OfferViewSet(viewsets.GenericViewSet):
    """
    "Faire une offre" (the messages appear in the chat):

    - POST /api/offers/                  the buyer: {"conversation", "amount_dzd"}
    - POST /api/offers/{id}/accept/      the seller (valid SOUGNA_OFFER_HOURS)
    - POST /api/offers/{id}/decline/     the seller
    - POST /api/offers/{id}/withdraw/    the buyer

    Each answers {"offer": {...}} or {"detail", "code"}.
    """

    permission_classes = [permissions.IsAuthenticated, IsPhoneVerified]

    def get_queryset(self):
        me = self.request.user
        return Offer.objects.filter(Q(buyer=me) | Q(seller=me)).select_related('listing', 'conversation')

    @staticmethod
    def _data(offer):
        return {'offer': {'id': offer.pk, 'amount_dzd': offer.amount_dzd,
                          'list_price_dzd': offer.list_price_dzd, 'status': offer.shown_status,
                          'valid_until': offer.valid_until}}

    @staticmethod
    def _refused(error):
        return Response({'detail': str(error), 'code': error.code},
                        status=status.HTTP_400_BAD_REQUEST
                        if error.code in ('offer_too_high', 'offer_too_low')
                        else status.HTTP_409_CONFLICT)

    def create(self, request):
        from messaging.models import Conversation
        from messaging.views import check_can_message

        serializer = OfferRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        me = request.user
        conversation = (Conversation.objects.select_related('listing', 'seller')
                        .filter(pk=serializer.validated_data['conversation'], buyer=me).first())
        if conversation is None:
            return Response({'detail': 'Only the buyer can make an offer here.',
                             'code': 'not_buyer'}, status=status.HTTP_404_NOT_FOUND)
        if Block.between(me, conversation.seller):
            return Response({'detail': "You can't send messages to this person.",
                             'code': 'blocked'}, status=status.HTTP_403_FORBIDDEN)
        check_can_message(me)  # no offers while messaging is blocked (strikes)
        today = timezone.now() - timedelta(days=1)
        if Offer.objects.filter(buyer=me, created_at__gte=today).count() >= OFFERS_PER_DAY:
            return Response({'detail': 'Too many offers today. Try again tomorrow.',
                             'code': 'offer_limit'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        try:
            offer = services.make_offer(conversation=conversation, buyer=me,
                                        amount=serializer.validated_data['amount_dzd'])
        except services.OfferRefused as error:
            data = {'detail': str(error), 'code': error.code}
            if error.code == 'offer_too_low':
                data['min_dzd'] = services.min_offer(conversation.listing.price_dzd)
            return Response(data, status=status.HTTP_400_BAD_REQUEST
                            if error.code in ('offer_too_high', 'offer_too_low')
                            else status.HTTP_409_CONFLICT)
        return Response(self._data(offer), status=status.HTTP_201_CREATED)

    def _answer(self, request, pk, accept):
        offer = self.get_object()
        if offer.seller_id != request.user.pk:
            return Response({'detail': 'Only the seller can answer.', 'code': 'not_seller'},
                            status=status.HTTP_403_FORBIDDEN)
        try:
            services.answer_offer(offer, accept=accept)
        except services.OfferRefused as error:
            return self._refused(error)
        return Response(self._data(offer))

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        return self._answer(request, pk, accept=True)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        return self._answer(request, pk, accept=False)

    @action(detail=True, methods=['post'])
    def withdraw(self, request, pk=None):
        offer = self.get_object()
        if offer.buyer_id != request.user.pk:
            return Response({'detail': 'Only the buyer can withdraw it.', 'code': 'not_buyer'},
                            status=status.HTTP_403_FORBIDDEN)
        try:
            services.withdraw_offer(offer)
        except services.OfferRefused as error:
            return self._refused(error)
        return Response(self._data(offer))


class UserReviewsView(generics.ListAPIView):
    """GET /api/users/{id}/reviews/ - the reviews someone received (newest first), from
    delivered orders only. "Not found" like their profile (hidden, blocked, ...)."""

    serializer_class = PublicReviewSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        from accounts.views import visible_users
        user = get_object_or_404(visible_users(self.request.user), pk=self.kwargs['pk'])
        return Review.objects.filter(subject=user, hidden=False).select_related('author')


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
