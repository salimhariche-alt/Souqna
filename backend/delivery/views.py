from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPhoneVerified
from listings.models import Listing
from messaging.models import Conversation

from . import services
from .models import Commune, Notification, Order
from .providers import ProviderError
from .serializers import (
    CommuneSerializer,
    DeliveryRequestSerializer,
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


def _seller_conversation(request, conversation_id):
    """The conversation, if I am its seller (else "not found")."""
    if not str(conversation_id or '').isdigit():
        return None
    return Conversation.objects.select_related('listing').filter(
        pk=int(conversation_id), seller=request.user).first()


def _active_order(conversation):
    return conversation.orders.exclude(status__in=Order.FINAL).first()


class QuoteView(APIView):
    """GET /api/delivery/quote/?conversation=&mode=&wilaya=&commune= - price estimate
    for the seller (delivery price from the company, plus our fee and the total)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        conversation = _seller_conversation(request, request.query_params.get('conversation'))
        if conversation is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        params = {key: request.query_params.get(key) for key in ('mode', 'wilaya', 'commune')}
        params.update(recipient_name='-', recipient_phone='0500000000', address='-----')
        serializer = DeliveryRequestSerializer(data=params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            return Response(services.quote(listing=conversation.listing, wilaya=data['wilaya'],
                                           commune=data['commune'], mode=data['mode']))
        except ProviderError as error:
            return Response({'detail': str(error), 'code': 'provider_error'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Orders sent by delivery. You only ever see orders where you are the buyer or the seller.

    - GET  /api/orders/                    my orders, newest first (?conversation=<id>)
    - POST /api/orders/                    the seller sends the item: {"conversation", "mode",
                                           "wilaya", "commune", "address", "recipient_name",
                                           "recipient_phone"}
    - GET  /api/orders/{id}/               one order with its timeline (asks the company for news)
    - POST /api/orders/{id}/cancel/        the seller cancels before pick-up
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
        conversation = self.request.query_params.get('conversation')
        if self.action == 'list' and conversation is not None:
            if not conversation.isdigit():
                return orders.none()
            orders = orders.filter(conversation_id=int(conversation))
        return orders

    def retrieve(self, request, pk=None):
        order = self.get_object()
        services.sync_order(order)
        order = self.get_queryset().get(pk=order.pk)
        return Response(self.get_serializer(order).data)

    def create(self, request):
        conversation = _seller_conversation(request, request.data.get('conversation'))
        if conversation is None:
            return Response({'detail': 'Only the seller can send this item by delivery.',
                             'code': 'not_seller'}, status=status.HTTP_404_NOT_FOUND)
        if conversation.listing.status == Listing.Status.SOLD:
            return Response({'detail': 'This item is already sold.', 'code': 'already_sold'},
                            status=status.HTTP_409_CONFLICT)
        existing = _active_order(conversation)
        if existing:
            return Response({'detail': 'A delivery is already on its way for this conversation.',
                             'code': 'order_exists', 'order': existing.pk},
                            status=status.HTTP_409_CONFLICT)
        serializer = DeliveryRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = services.create_order(conversation=conversation, data=serializer.validated_data)
        except ProviderError as error:
            return Response({'detail': str(error), 'code': 'provider_error'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        order = self.get_queryset().get(pk=order.pk)
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.seller_id != request.user.pk:
            return Response({'detail': 'Only the seller can cancel.', 'code': 'not_seller'},
                            status=status.HTTP_403_FORBIDDEN)
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
