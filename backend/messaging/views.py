from django.db import transaction
from django.db.models import Count, F, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsPhoneVerified
from moderation.limits import check_daily_limit

from .models import Conversation, Message
from .serializers import (
    ConversationDetailSerializer,
    ConversationListSerializer,
    MessageSerializer,
    StartConversationSerializer,
)


def with_activity(conversations, me):
    """Add the last message, the time of last activity and my unread count to each row."""
    latest = Message.objects.filter(conversation=OuterRef('pk')).order_by('-sent_at', '-id')
    unread = (
        Message.objects
        .filter(conversation=OuterRef('pk'), read=False)
        .exclude(sender=me)
        .order_by()
        .values('conversation')
        .annotate(n=Count('pk'))
        .values('n')
    )
    return conversations.annotate(
        last_text=Subquery(latest.values('text')[:1]),
        last_sender_id=Subquery(latest.values('sender_id')[:1]),
        last_sent_at=Subquery(latest.values('sent_at')[:1]),
        last_activity=Coalesce(Subquery(latest.values('sent_at')[:1]), F('created_at')),
        unread_count=Coalesce(Subquery(unread), 0),
    ).order_by('-last_activity', '-id')


class ConversationViewSet(mixins.ListModelMixin,
                          mixins.RetrieveModelMixin,
                          viewsets.GenericViewSet):
    """
    Buyer-seller messaging. You must be logged in, and you only ever see
    conversations where you are the buyer or the seller.

    - GET  /api/conversations/                 my conversations, newest activity first
                                               (?listing=<id> to find the one about a listing)
    - POST /api/conversations/                 start one: {"listing": id, "text": "..."}
                                               (reuses the existing one for that listing)
    - GET  /api/conversations/{id}/            all messages, oldest first; marks the other
                                               person's messages as read
    - POST /api/conversations/{id}/messages/   send a message: {"text": "..."}
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # Starting a conversation or sending a message needs a verified phone number.
        if self.action in ('create', 'messages'):
            return [permissions.IsAuthenticated(), IsPhoneVerified()]
        return super().get_permissions()

    def get_queryset(self):
        me = self.request.user
        conversations = (
            Conversation.objects
            .filter(Q(buyer=me) | Q(seller=me))  # never anyone else's conversations
            .select_related('listing', 'buyer', 'seller')
            .prefetch_related('listing__photos')
        )
        if self.action == 'list':
            # ?listing=<id>: only my conversation(s) about that listing.
            listing_id = self.request.query_params.get('listing')
            if listing_id is not None:
                if not listing_id.isdigit():
                    return conversations.none()
                conversations = conversations.filter(listing_id=int(listing_id))
            conversations = with_activity(conversations, me)
        return conversations

    def get_serializer_class(self):
        return {
            'list': ConversationListSerializer,
            'create': StartConversationSerializer,
            'messages': MessageSerializer,
        }.get(self.action, ConversationDetailSerializer)

    def detail_response(self, conversation, status_code=status.HTTP_200_OK):
        conversation = self.get_queryset().get(pk=conversation.pk)
        data = ConversationDetailSerializer(conversation, context=self.get_serializer_context()).data
        return Response(data, status=status_code)

    def create(self, request):
        """Start a conversation, or add to the existing one for this listing."""
        serializer = StartConversationSerializer(data=request.data,
                                                 context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        listing = serializer.validated_data['listing']

        # Only a NEW conversation counts towards the daily limit (not more messages).
        if not Conversation.objects.filter(listing=listing, buyer=request.user).exists():
            check_daily_limit(request.user, 'conversations')

        with transaction.atomic():
            conversation, created = Conversation.objects.get_or_create(
                listing=listing, buyer=request.user, defaults={'seller': listing.seller},
            )
            Message.objects.create(conversation=conversation, sender=request.user,
                                   text=serializer.validated_data['text'])

        return self.detail_response(
            conversation, status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        """Open a conversation. The other person's messages become "read"."""
        conversation = self.get_object()  # "not found" if it isn't yours
        conversation.messages.filter(read=False).exclude(sender=request.user).update(read=True)
        return self.detail_response(conversation)

    @action(detail=True, methods=['post'])
    def messages(self, request, pk=None):
        """Send a message in this conversation."""
        conversation = self.get_object()  # "not found" if it isn't yours
        serializer = MessageSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        serializer.save(conversation=conversation, sender=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
