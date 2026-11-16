from django.db import transaction
from django.db.models import Count, F, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import IsPhoneVerified
from moderation.checks import message_flags
from moderation.limits import check_daily_limit
from moderation.models import Block
from souqna_api.exceptions import DetailedAPIException

from .audio import AudioError, inspect_audio
from .models import Conversation, Message
from .voice import check_can_send_voice
from .serializers import (
    ConversationDetailSerializer,
    ConversationListSerializer,
    MessageSerializer,
    StartConversationSerializer,
)


class BlockedConversation(DetailedAPIException):
    status_code = status.HTTP_403_FORBIDDEN


def warning_fields(text):
    """Check a new message (phone number, link, WhatsApp/Telegram, payment in advance).

    The message is always sent; if something is found it is marked, so the receiver's
    app can show a warning, and admins can count these per user.
    """
    reasons = message_flags(text)
    return {'flagged': bool(reasons), 'flag_reasons': reasons}


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
        last_audio=Subquery(latest.values('audio')[:1]),
        last_duration_ms=Subquery(latest.values('duration_ms')[:1]),
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
    - POST /api/conversations/{id}/voice/      send a voice message (form field "audio")
    - GET  /api/conversations/unread-count/    {"unread": n} for the tab badge
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # Starting a conversation or sending a message (text or voice) needs a verified phone.
        if self.action in ('create', 'messages', 'voice'):
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

        text = serializer.validated_data['text']
        with transaction.atomic():
            conversation, created = Conversation.objects.get_or_create(
                listing=listing, buyer=request.user, defaults={'seller': listing.seller},
            )
            Message.objects.create(conversation=conversation, sender=request.user, text=text,
                                   **warning_fields(text))

        return self.detail_response(
            conversation, status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        """Open a conversation. The other person's messages become "read".

        ?after=<message id> returns only the messages newer than that one.
        """
        conversation = self.get_object()  # "not found" if it isn't yours
        conversation.messages.filter(read=False).exclude(sender=request.user).update(read=True)
        after = request.query_params.get('after')
        if after is not None and not after.isdigit():
            return Response({'detail': '"after" must be a message id.'},
                            status=status.HTTP_400_BAD_REQUEST)
        conversation = self.get_queryset().get(pk=conversation.pk)
        context = {**self.get_serializer_context(),
                   'after': int(after) if after is not None else None}
        return Response(ConversationDetailSerializer(conversation, context=context).data)

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        """GET /api/conversations/unread-count/ - {"unread": total unread messages for me}
        (for the red badge on the Messages tab)."""
        me = request.user
        unread = (Message.objects
                  .filter(Q(conversation__buyer=me) | Q(conversation__seller=me), read=False)
                  .exclude(sender=me)
                  .count())
        return Response({'unread': unread})

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def voice(self, request, pk=None):
        """Send a voice message: form field "audio" (AAC/M4A, max 60 s, max 1 MB).

        Verified phones only; daily limits per conversation.
        """
        conversation = self.get_object()  # "not found" if it isn't yours
        self.check_not_blocked(conversation)
        check_can_send_voice(conversation, request.user)

        uploaded = request.FILES.get('audio')
        if uploaded is None:
            return Response({'audio': ['Send the recording in the "audio" field.']},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            duration_ms, extension = inspect_audio(uploaded)
        except AudioError as error:
            return Response({'audio': [error.message], 'code': error.code},
                            status=status.HTTP_400_BAD_REQUEST)

        message = Message(conversation=conversation, sender=request.user, text='',
                          duration_ms=duration_ms)
        message.audio.save(f'voice{extension}', uploaded, save=False)
        message.save()
        data = MessageSerializer(message, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_201_CREATED)

    def check_not_blocked(self, conversation):
        if Block.between(conversation.buyer, conversation.seller):
            raise BlockedConversation({'detail': "You can't send messages to this person.",
                                       'code': 'blocked'})

    @action(detail=True, methods=['post'])
    def messages(self, request, pk=None):
        """Send a message in this conversation."""
        conversation = self.get_object()  # "not found" if it isn't yours
        self.check_not_blocked(conversation)
        serializer = MessageSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        text = serializer.validated_data['text']
        serializer.save(conversation=conversation, sender=request.user, **warning_fields(text))
        return Response(serializer.data, status=status.HTTP_201_CREATED)
