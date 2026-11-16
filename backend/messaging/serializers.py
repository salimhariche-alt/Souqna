from rest_framework import serializers

from listings.models import Listing
from listings.serializers import cover_photo_url

from .models import MAX_MESSAGE_LENGTH, Message

MESSAGE_ERRORS = {
    'required': "Message can't be empty.",
    'blank': "Message can't be empty.",
    'null': "Message can't be empty.",
    'max_length': f'Messages can be at most {MAX_MESSAGE_LENGTH:,} characters.',
}


def message_text_field():
    # Spaces at the start/end are removed, so a message of only spaces counts as empty.
    return serializers.CharField(max_length=MAX_MESSAGE_LENGTH, trim_whitespace=True,
                                 error_messages=MESSAGE_ERRORS,
                                 style={'base_template': 'textarea.html'})


class PersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    display_name = serializers.CharField()


class ListingSummarySerializer(serializers.ModelSerializer):
    cover_photo = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = ['id', 'title', 'price_dzd', 'status', 'cover_photo']

    def get_cover_photo(self, listing):
        return cover_photo_url(listing, self.context.get('request'))


def other_person(conversation, me):
    return conversation.seller if conversation.buyer_id == me.id else conversation.buyer


class MessageSerializer(serializers.ModelSerializer):
    """One message. Only "text" is sent by the app; everything else is filled in."""

    text = message_text_field()
    sender = PersonSerializer(read_only=True)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'sender', 'is_mine', 'text', 'sent_at', 'read']
        read_only_fields = ['sent_at', 'read']

    def get_is_mine(self, message):
        return message.sender_id == self.context['request'].user.id


class StartConversationSerializer(serializers.Serializer):
    """Input for starting a conversation: which listing, and the first message."""

    # Only visible listings: not flagged/rejected, seller not suspended or banned.
    listing = serializers.PrimaryKeyRelatedField(
        queryset=Listing.objects.filter(review_status=Listing.Review.APPROVED,
                                        seller__is_active=True),
        error_messages={
            'required': 'Choose the listing you want to ask about.',
            'null': 'Choose the listing you want to ask about.',
            'does_not_exist': "This listing doesn't exist.",
            'incorrect_type': "This listing doesn't exist.",
        },
    )
    text = message_text_field()

    def validate_listing(self, listing):
        if listing.seller_id == self.context['request'].user.id:
            raise serializers.ValidationError(
                "You can't start a conversation about your own listing.")
        return listing


class ConversationListSerializer(serializers.Serializer):
    """One row in "my conversations". Uses the extra values added in the view."""

    id = serializers.IntegerField()
    listing = ListingSummarySerializer()
    other_person = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField()
    last_activity = serializers.DateTimeField()

    def get_other_person(self, conversation):
        return PersonSerializer(other_person(conversation, self.context['request'].user)).data

    def get_last_message(self, conversation):
        if conversation.last_text is None:
            return None
        return {
            'text': conversation.last_text,
            'sent_at': serializers.DateTimeField().to_representation(conversation.last_sent_at),
            'is_mine': conversation.last_sender_id == self.context['request'].user.id,
        }


class ConversationDetailSerializer(serializers.Serializer):
    """One conversation with all its messages, oldest first."""

    id = serializers.IntegerField()
    listing = ListingSummarySerializer()
    buyer = PersonSerializer()
    seller = PersonSerializer()
    other_person = serializers.SerializerMethodField()
    messages = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()

    def get_other_person(self, conversation):
        return PersonSerializer(other_person(conversation, self.context['request'].user)).data

    def get_messages(self, conversation):
        messages = conversation.messages.select_related('sender').order_by('sent_at', 'id')
        return MessageSerializer(messages, many=True, context=self.context).data
